import { randomInt, randomUUID } from "node:crypto";
import { TuyaError } from "@open-tuya/core";
import {
  AppCloudTuyaClient,
  type CloudAppTransport,
  type RequestParts,
} from "./client.js";
import { mapDataPointCodes } from "./dataPointCodes.js";
import { type Fetch, fetchJson } from "./fetchJson.js";
import { openMqttConnection } from "./mqtt/connection.js";
import type {
  DeviceRecord,
  HomeRecord,
  PushConfigRecord,
  RefreshResult,
  StatusRelations,
} from "./protocol/records.js";
import { signRequest } from "./protocol/request.js";
import { type CloudResponse, parseResponse } from "./protocol/response.js";
import {
  DevicePush,
  type OpenMqttConnection,
  type PushConfig,
} from "./push.js";
import type { CloudAppSession } from "./session.js";

const REFRESH_MARGIN_IN_MS = 60_000;
// Source: The SDK draws each 12-character nonce from these characters, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
// DESIGN.md#cloud-app-requests says why from these.
const NONCE_CHARACTERS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
const NONCE_LENGTH = 12;
// Source: The cloud answers a session it no longer takes with "sign invalid",
// on which Home Assistant asks the user to sign in again, in
// https://github.com/home-assistant/core/commit/10d3b10da47b47f38ccee07b87056834cdd3c781
// and https://github.com/home-assistant/core/issues/178266#issuecomment-5200735391,
// and an expired token with 1010, in
// https://github.com/make-all/tuya-local/issues/3905.
const SIGN_INVALID = "sign invalid";
const TOKEN_EXPIRED = "1010";
// Source: The cloud answers a request over its rate limit with this message,
// in https://github.com/home-assistant/core/issues/178266#issuecomment-5200735391.
const RATE_LIMIT_EXCEEDED = "API_QPS_LIMIT_OR_DEGRADE";

export interface CreateCloudAppAccountOptions {
  /** The client ID the session signed in with:
   * `CreateQrLoginOptions.clientId`. */
  clientId: string;
  session: CloudAppSession;
  /** Called with the new session after each refresh. Persist it: the refresh
   * token it replaces no longer works. */
  onSessionChange: (session: CloudAppSession) => void;
}

/** A device as the account lists it. `deviceId` and `localKey` are what
 * `createLocalTuyaClient` takes; the cloud gives neither the device's LAN
 * address nor its protocol version, which `discoverDevices` reports. */
export interface CloudAppDevice {
  deviceId: string;
  name: string;
  productKey: string;
  /** Missing on some gateways. */
  localKey?: string;
  category: string;
  online: boolean;
  homeId: string;
  /** The device's address on its gateway, on a device reached through one. */
  nodeId?: string;
}

/** Reaches the cloud with a session from `QrLogin`: see
 * `CloudAppAccount`. */
export function createCloudAppAccount(
  options: CreateCloudAppAccountOptions,
): CloudAppAccount {
  return new CloudAppAccount(fetch, openMqttConnection, options);
}

// Source: Every request after the login goes to the session's endpoint,
// signed, and refreshes the token with GET /v1.0/m/token/{refreshToken} once
// it is a minute from expiring, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
/** An account on the cloud the Smart Life app signs in to. It refreshes the
 * session a minute before it expires, and once more when the cloud refuses
 * it, then rejects with a `TuyaError` with code `SESSION_EXPIRED`. Its
 * clients share one MQTT connection for the devices' pushes. Each request
 * rejects with `REQUEST_TIMED_OUT` when the cloud does not answer within
 * 10 s, `RATE_LIMITED` when it refuses one over its rate limit, and
 * `REQUEST_REJECTED` when it answers with another error. */
export class CloudAppAccount implements AsyncDisposable {
  private session: CloudAppSession;
  private refreshing: Promise<void> | undefined;
  private readonly closing = new AbortController();
  private readonly push: DevicePush;

  constructor(
    private readonly fetch: Fetch,
    openMqtt: OpenMqttConnection,
    private readonly options: CreateCloudAppAccountOptions,
  ) {
    this.session = options.session;
    this.push = new DevicePush(openMqtt, () => this.fetchPushConfig());
  }

  // Source: Homes are listed by GET /v1.0/m/life/users/homes, and each
  // home's devices by GET /v1.0/m/life/ha/home/devices with its owner ID, in
  // https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
  /** Lists the devices in every home of the account. */
  async listDevices(): Promise<CloudAppDevice[]> {
    const homes = (await this.request(
      "GET",
      "/v1.0/m/life/users/homes",
    )) as HomeRecord[];
    const devices: CloudAppDevice[] = [];
    for (const home of homes) {
      const homeId = String(home.ownerId);
      const records = (await this.request(
        "GET",
        "/v1.0/m/life/ha/home/devices",
        { query: { homeId } },
      )) as DeviceRecord[];
      for (const record of records) {
        devices.push({
          deviceId: record.id,
          name: record.name,
          productKey: record.product_id,
          ...(record.local_key && { localKey: record.local_key }),
          category: record.category,
          online: record.online,
          homeId,
          ...(record.node_id && { nodeId: record.node_id }),
        });
      }
    }
    return devices;
  }

  // Source: A device's data points map to the cloud's codes through
  // GET /v1.0/m/life/devices/{id}/status, in
  // https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13,
  // and a device of a custom type answers true to
  // GET /v1.0/m/life/ha/{id}/code/custom-type, in
  // https://github.com/tuya/tuya-device-sharing-sdk/commit/32440d2040f47287d5f58253feec12eca7a2a7b3.
  /** Fetches how the device's data points map to the cloud's codes, and
   * resolves with a client for it. */
  async createClient(deviceId: string): Promise<AppCloudTuyaClient> {
    const id = encodeURIComponent(deviceId);
    const relations = (await this.request(
      "GET",
      `/v1.0/m/life/devices/${id}/status`,
    )) as StatusRelations;
    const customType = await this.request(
      "GET",
      `/v1.0/m/life/ha/${id}/code/custom-type`,
    );
    const transport: CloudAppTransport = {
      request: (method, path, parts) => this.request(method, path, parts),
      subscribe: (listener) => this.push.subscribe(deviceId, listener),
    };
    return new AppCloudTuyaClient(
      transport,
      deviceId,
      mapDataPointCodes(
        relations.dpStatusRelationDTOS ?? [],
        customType === true || customType === "true",
      ),
    );
  }

  /** Stops every request in flight and the MQTT connection, and resolves
   * once the connection is released. */
  async close(): Promise<void> {
    this.closing.abort(
      new TuyaError("CONNECTION_LOST", "The account is closed"),
    );
    await this.push.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private async request(
    method: string,
    path: string,
    parts: RequestParts = {},
  ): Promise<unknown> {
    if (Date.now() >= this.session.expiresAtInMs - REFRESH_MARGIN_IN_MS) {
      await this.refresh(this.session);
    }
    const session = this.session;
    try {
      return await this.send(method, path, parts, session);
    } catch (error) {
      if (!(error instanceof TuyaError && error.code === "SESSION_EXPIRED")) {
        throw error;
      }
      await this.refresh(session);
      return await this.send(method, path, parts, this.session);
    }
  }

  // One refresh at a time: the refresh token works once, so a second refresh
  // in flight would send one the first had already spent.
  private refresh(stale: CloudAppSession): Promise<void> {
    if (this.session !== stale) {
      return Promise.resolve();
    }
    this.refreshing ??= this.renew().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  // Source: A refresh answers with accessToken, refreshToken and expireTime,
  // in https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
  private async renew(): Promise<void> {
    const session = this.session;
    const result = (await this.send(
      "GET",
      `/v1.0/m/token/${encodeURIComponent(session.refreshToken)}`,
      {},
      session,
    )) as RefreshResult;
    this.session = {
      endpoint: session.endpoint,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAtInMs: Date.now() + result.expireTime * 1000,
    };
    this.options.onSessionChange(this.session);
  }

  private async send(
    method: string,
    path: string,
    parts: RequestParts,
    session: CloudAppSession,
  ): Promise<unknown> {
    const signed = signRequest({
      clientId: this.options.clientId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      requestId: randomUUID(),
      timeInMs: Date.now(),
      ...(parts.query && { query: { data: parts.query, nonce: drawNonce() } }),
      ...(parts.body && { body: { data: parts.body, nonce: drawNonce() } }),
    });
    const url = new URL(path, session.endpoint);
    if (signed.query) {
      url.searchParams.set("encdata", signed.query);
    }
    const response = parseResponse(
      await fetchJson(
        this.fetch,
        url.href,
        {
          method,
          headers: {
            ...signed.headers,
            ...(signed.body && { "Content-Type": "application/json" }),
          },
          ...(signed.body && { body: signed.body }),
        },
        this.closing.signal,
      ),
      signed.encryptionKey,
    );
    if (!response.success) {
      throw cloudError(response);
    }
    return response.result;
  }

  // Source: The MQTT credentials come from POST /v1.0/m/life/ha/access/config
  // with a link ID drawn afresh for each, in
  // https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1
  // and https://github.com/tuya/tuya-device-sharing-sdk/commit/1496fc3c24643d0045e722698cd34978ce2636d1.
  // No source shows the cloud taking a link ID of another form.
  private async fetchPushConfig(): Promise<PushConfig> {
    const result = (await this.request(
      "POST",
      "/v1.0/m/life/ha/access/config",
      { body: { linkId: `tuya-device-sharing-sdk-python.${randomUUID()}` } },
    )) as PushConfigRecord;
    return {
      url: result.url,
      clientId: result.clientId,
      username: result.username,
      password: result.password,
      expireTimeInSeconds: result.expireTime,
      deviceTopic: result.topic.devId.sub,
    };
  }
}

function cloudError(
  response: Extract<CloudResponse, { success: false }>,
): TuyaError {
  const text = `The cloud answered ${response.code}: ${response.message}`;
  if (response.message === SIGN_INVALID || response.code === TOKEN_EXPIRED) {
    return new TuyaError("SESSION_EXPIRED", text);
  }
  if (response.message === RATE_LIMIT_EXCEEDED) {
    return new TuyaError("RATE_LIMITED", text);
  }
  return new TuyaError("REQUEST_REJECTED", text);
}

function drawNonce(): Buffer {
  let nonce = "";
  for (let index = 0; index < NONCE_LENGTH; index++) {
    nonce += NONCE_CHARACTERS[randomInt(NONCE_CHARACTERS.length)];
  }
  return Buffer.from(nonce);
}
