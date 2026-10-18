import { randomUUID } from "node:crypto";
import {
  type Fetch,
  fetchJson,
  MqttSession,
  type OpenMqttConnection,
  type TuyaCloudAccount,
  type TuyaCloudDevice,
  TuyaError,
} from "@open-tuya/core";
import {
  type DeveloperCloudTransport,
  DeveloperCloudTuyaClient,
  type RequestParts,
} from "./client.js";
import { openMqttConnection } from "./mqtt.js";
import type {
  DeviceDetail,
  DevicePage,
  DeviceRecord,
  Envelope,
  PushConfigRecord,
  ThingModel,
  ThingProperty,
  TokenResult,
} from "./protocol/records.js";
import { signRequest } from "./protocol/request.js";
import { DevicePush, type PushConfig } from "./push.js";

// Source: The hosts of each data center, in
// https://github.com/tuya/tuya-connector/commit/155a9c87ca3981392049e2a025d86619ee0dc311,
// and the code tinytuya names each with, in
// https://github.com/jasonacox/tinytuya/commit/5244bdae200734aa2083e65dbc1157fe9d593321
// and https://github.com/jasonacox/tinytuya/commit/97f608f8cd874a1a00b9b4117205ba632eb1938c.
/** The origin of each Tuya data center's API, by the code tinytuya names it
 * with. A project reaches only the devices of app accounts in its own. */
export const DEVELOPER_DATA_CENTERS = {
  cn: "https://openapi.tuyacn.com",
  us: "https://openapi.tuyaus.com",
  "us-e": "https://openapi-ueaz.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  "eu-w": "https://openapi-weaz.tuyaeu.com",
  in: "https://openapi.tuyain.com",
  sg: "https://openapi-sg.iotbing.com",
} as const;

export type DeveloperDataCenter = keyof typeof DEVELOPER_DATA_CENTERS;

const RENEW_MARGIN_IN_MS = 60_000;
const DEVICE_PAGE_SIZE = "50";
// Source: The cloud answers a token it no longer takes with 1010, in
// https://github.com/tuya/tuya-connector-nodejs/commit/e619df60109ac4f06e9b44de7fa15bf4d1b24690,
// as captured in https://github.com/jasonacox/tinytuya/issues/94#issuecomment-1004076959.
const TOKEN_INVALID = "1010";
// Source: Each code below refuses a request for want of a subscription or a
// permission, as captured in https://github.com/jasonacox/tinytuya/issues/330,
// https://github.com/jasonacox/tinytuya/issues/346,
// https://github.com/tuya/tuya-home-assistant/issues/55,
// https://github.com/tuya/tuya-home-assistant/issues/627,
// https://github.com/tuya/tuya-home-assistant/issues/635,
// https://github.com/tuya/tuya-homebridge/issues/108,
// https://github.com/rospogrigio/localtuya/issues/1719 and
// https://github.com/rospogrigio/localtuya/issues/2079#issuecomment-3340624621.
const PERMISSION_DENIED_CODES = new Set([
  "1106",
  "1114",
  "2007",
  "28841002",
  "28841004",
  "28841101",
  "28841105",
  "28841106",
  "28841107",
]);

export interface CreateDeveloperCloudAccountOptions {
  /** The cloud project's Access ID, which Tuya also calls its client ID. */
  accessId: string;
  /** The cloud project's Access Secret. */
  accessSecret: string;
  /** The data center the project and its linked app accounts are in. */
  dataCenter: DeveloperDataCenter;
}

export interface ListDevicesOptions {
  /** A device of the account whose devices to list. The list then comes from
   * that account alone, which a project refused the list of every linked
   * account can still read. */
  viaDeviceId?: string;
}

/** Reaches the Tuya developer platform with a cloud project's credentials:
 * see `DeveloperCloudAccount`. */
export function createDeveloperCloudAccount(
  options: CreateDeveloperCloudAccountOptions,
): DeveloperCloudAccount {
  return new DeveloperCloudAccount(fetch, openMqttConnection, options);
}

interface Token {
  accessToken: string;
  uid: string;
  expiresAtInMs: number;
}

// Source: A project takes its token with GET /v1.0/token?grant_type=1, signed
// without one, and takes another once the cloud answers 1010, in
// https://github.com/jasonacox/tinytuya/commit/4e553eedaa279403278f0b402d2efbc9ece5a7a0
// and https://github.com/tuya/tuya-connector-nodejs/commit/e619df60109ac4f06e9b44de7fa15bf4d1b24690.
/** A Tuya developer platform project. It takes a token a minute before the
 * last expires, and once more when the cloud refuses it. Its clients share
 * one MQTT connection for the devices' pushes. Each request rejects with
 * `PERMISSION_DENIED` when the project lacks a subscription or permission,
 * `REQUEST_TIMED_OUT` when the cloud does not answer within 10 s,
 * `RATE_LIMITED` on HTTP 429, and `REQUEST_REJECTED` when the cloud answers
 * with another error. */
export class DeveloperCloudAccount implements TuyaCloudAccount {
  private token: Token | undefined;
  private fetchingToken: Promise<Token> | undefined;
  private readonly origin: string;
  private readonly closing = new AbortController();
  private readonly mqtt: MqttSession<PushConfig>;
  private readonly push: DevicePush;

  constructor(
    private readonly fetch: Fetch,
    openMqtt: OpenMqttConnection,
    private readonly options: CreateDeveloperCloudAccountOptions,
  ) {
    this.origin = DEVELOPER_DATA_CENTERS[options.dataCenter];
    this.mqtt = new MqttSession<PushConfig>(openMqtt, {
      fetchCredentials: () => this.fetchPushConfig(),
      onMessage: (message, config) => this.push.receive(message, config),
    });
    this.push = new DevicePush(this.mqtt);
  }

  // Source: Every linked app account's devices are listed by
  // GET /v1.0/iot-01/associated-users/devices, a page at a time after
  // `last_row_key` while `has_more`, in
  // https://github.com/jasonacox/tinytuya/commit/5afef6ebceaf25ebd0fe8718be68371878a35353.
  // Source: A project refused that list takes the account's ID from one of
  // its devices, and lists GET /v1.0/users/{uid}/devices, in
  // https://github.com/jasonacox/tinytuya/commit/c9455aebf0294d74eadbd4d758d0fd3ba4d55428
  // and https://github.com/TuyaAPI/cli/commit/d6cdfdc24657bff77ea3ae1681aa9e55ed1d3d35.
  /** Lists the devices of every app account linked to the project, or with
   * `viaDeviceId`, of that device's account alone. */
  async listDevices(
    options: ListDevicesOptions = {},
  ): Promise<TuyaCloudDevice[]> {
    let records: DeviceRecord[];
    if (options.viaDeviceId) {
      const detail = (await this.request(
        "GET",
        `/v1.0/devices/${encodeURIComponent(options.viaDeviceId)}`,
      )) as DeviceDetail;
      records = (await this.request(
        "GET",
        `/v1.0/users/${encodeURIComponent(detail.uid)}/devices`,
      )) as DeviceRecord[];
    } else {
      records = [];
      let lastRowKey: string | undefined;
      for (;;) {
        const page = (await this.request(
          "GET",
          "/v1.0/iot-01/associated-users/devices",
          {
            query: {
              size: DEVICE_PAGE_SIZE,
              ...(lastRowKey && { last_row_key: lastRowKey }),
            },
          },
        )) as DevicePage;
        records.push(...(page.devices ?? []));
        if (!page.has_more || !page.last_row_key) {
          break;
        }
        lastRowKey = page.last_row_key;
      }
    }
    return records.map((record) => ({
      deviceId: record.id,
      name: record.name,
      productKey: record.product_id,
      ...(record.local_key && { localKey: record.local_key }),
      category: record.category,
      online: record.online,
      ...(record.node_id && { nodeId: record.node_id }),
    }));
  }

  // Source: A device's thing model names each data point's ID as `abilityId`
  // beside its code, as JSON text in `model`, in
  // https://github.com/tuya/tuya-connector/commit/25424c594135e8c5f4c684a0b7cce8fc7b4fcca6
  // and https://github.com/xZetsubou/hass-localtuya/commit/2f733ce0dd99076b4936a7ce08642bca87ad4a93,
  // and as captured in https://github.com/jasonacox/tinytuya/issues/537.
  /** Fetches the device's thing model, and resolves with a client for it. */
  async createClient(deviceId: string): Promise<DeveloperCloudTuyaClient> {
    const thing = (await this.request(
      "GET",
      `/v2.0/cloud/thing/${encodeURIComponent(deviceId)}/model`,
    )) as ThingModel;
    const model = JSON.parse(thing.model) as {
      services?: { properties?: ThingProperty[] }[];
    };
    const codes = new Map<string, string>();
    for (const service of model.services ?? []) {
      for (const property of service.properties ?? []) {
        codes.set(String(property.abilityId), property.code);
      }
    }
    const transport: DeveloperCloudTransport = {
      request: (method, path, parts) => this.request(method, path, parts),
      subscribe: (listener) => this.push.subscribe(deviceId, listener),
    };
    return new DeveloperCloudTuyaClient(transport, deviceId, codes);
  }

  /** Stops every request in flight and the MQTT connection, and resolves
   * once the connection is released. */
  async close(): Promise<void> {
    this.closing.abort(
      new TuyaError("CONNECTION_LOST", "The account is closed"),
    );
    await this.mqtt.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private async request(
    method: string,
    path: string,
    parts: RequestParts = {},
  ): Promise<unknown> {
    const token = await this.validToken();
    try {
      return await this.send(method, path, parts, token.accessToken);
    } catch (error) {
      if (!(error instanceof TokenInvalid)) {
        throw error;
      }
      if (this.token === token) {
        this.token = undefined;
      }
      const fresh = await this.validToken();
      try {
        return await this.send(method, path, parts, fresh.accessToken);
      } catch (retried) {
        throw retried instanceof TokenInvalid ? retried.error : retried;
      }
    }
  }

  // One token request at a time: each replaces the token the last one gave.
  private async validToken(): Promise<Token> {
    if (
      this.token &&
      Date.now() < this.token.expiresAtInMs - RENEW_MARGIN_IN_MS
    ) {
      return this.token;
    }
    this.fetchingToken ??= this.fetchToken().finally(() => {
      this.fetchingToken = undefined;
    });
    this.token = await this.fetchingToken;
    return this.token;
  }

  private async fetchToken(): Promise<Token> {
    let result: TokenResult;
    try {
      result = (await this.send(
        "GET",
        "/v1.0/token",
        { query: { grant_type: "1" } },
        "",
      )) as TokenResult;
    } catch (error) {
      throw error instanceof TokenInvalid ? error.error : error;
    }
    return {
      accessToken: result.access_token,
      uid: result.uid,
      expiresAtInMs: Date.now() + result.expire_time * 1000,
    };
  }

  private async send(
    method: string,
    path: string,
    parts: RequestParts,
    accessToken: string,
  ): Promise<unknown> {
    const body = parts.body && JSON.stringify(parts.body);
    const signed = signRequest({
      clientId: this.options.accessId,
      secret: this.options.accessSecret,
      accessToken,
      timeInMs: Date.now(),
      method,
      path,
      ...(parts.query && { query: parts.query }),
      ...(body !== undefined && { body }),
    });
    const envelope = (await fetchJson(
      this.fetch,
      this.origin + signed.target,
      {
        method,
        headers: signed.headers,
        ...(body !== undefined && { body }),
      },
      this.closing.signal,
    )) as Envelope;
    if (envelope.success) {
      return envelope.result;
    }
    throw cloudError(envelope);
  }

  // Source: A project's MQTT credentials come from
  // POST /v1.0/iot-03/open-hub/access-config with the token's uid, in
  // https://github.com/tuya/tuya-homebridge/commit/a0da33fb0bf046fef5b915c07c78098dd068809f
  // and https://github.com/tuya/tuya-iot-python-sdk/commit/f97d9ea73226efcac36eebf74b080c4d4738518e,
  // and with a project's own token in
  // https://github.com/adrianjagielak/homebridge-tuya-plus/commit/0c5cc665272c9510ad7bc382aafda3ee4ea26017.
  // Source: `msg_encrypted_version` 2.0 asks for AES-GCM, in
  // https://github.com/tuya/tuya-homebridge/commit/a0da33fb0bf046fef5b915c07c78098dd068809f.
  private async fetchPushConfig(): Promise<PushConfig> {
    const token = await this.validToken();
    const result = (await this.request(
      "POST",
      "/v1.0/iot-03/open-hub/access-config",
      {
        body: {
          uid: token.uid,
          link_id: randomUUID(),
          link_type: "mqtt",
          topics: "device",
          msg_encrypted_version: "2.0",
        },
      },
    )) as PushConfigRecord;
    return {
      url: result.url,
      clientId: result.client_id,
      username: result.username,
      password: result.password,
      expireTimeInSeconds: result.expire_time,
      deviceTopic: result.source_topic.device,
    };
  }
}

/** A token the cloud no longer takes: the request is sent once more with a
 * new one. */
class TokenInvalid extends Error {
  constructor(readonly error: TuyaError) {
    super(error.message);
  }
}

function cloudError(envelope: Envelope): Error {
  const code = String(envelope.code ?? "");
  const text = `The cloud answered ${code}: ${envelope.msg ?? ""}`;
  if (code === TOKEN_INVALID) {
    return new TokenInvalid(new TuyaError("REQUEST_REJECTED", text));
  }
  if (PERMISSION_DENIED_CODES.has(code)) {
    return new TuyaError("PERMISSION_DENIED", text);
  }
  return new TuyaError("REQUEST_REJECTED", text);
}
