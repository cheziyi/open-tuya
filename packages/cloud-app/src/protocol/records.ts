import {
  type DataPoints,
  type DataPointValue,
  isDataPointValue,
  TuyaError,
} from "@open-tuya/core";

// Source: Each field below as the SDK reads it, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13,
// and as the responses captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301
// and https://github.com/home-assistant/core/issues/162625 carry it.

// Source: A data point report is protocol 4, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
const PROTOCOL_DEVICE_REPORT = 4;
// Source: A protocol 20 push says what happened to a device by `bizCode`, and
// to which by `bizData.devId`: "online" and "offline" are two of its codes, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
const PROTOCOL_OTHER = 20;

export interface QrCodeResult {
  qrcode: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  /** In seconds. */
  expire_time: number;
  endpoint: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  /** In seconds. */
  expireTime: number;
}

export interface HomeRecord {
  ownerId: string | number;
}

export interface DeviceRecord {
  id: string;
  name: string;
  // Source: A hub's record can lack `local_key`, in
  // https://github.com/make-all/tuya-local/commit/10c6eee6ab862ee5746e57919c48149a2207eb93.
  /** Missing on some gateways. */
  local_key?: string;
  product_id: string;
  category: string;
  online: boolean;
  // Source: A device behind a gateway carries `node_id`, which tuya-local reads
  // off the record, in
  // https://github.com/make-all/tuya-local/commit/8896547f6af5ea6f3252256e0dc94cc4e54aa983.
  node_id?: string;
  status?: { code?: unknown; value?: unknown }[];
}

export interface StatusRelation {
  dpId: number;
  statusCode: string;
  /** JSON, such as `{"switch_1":"$"}`. */
  statusFormat: string;
  supportLocal: boolean;
  valueConvert: string;
  /** Such as `Integer`, in any letter case. */
  valueType?: unknown;
  /** JSON, such as `{"unit":"%","min":0,"max":100,"scale":0,"step":1}`. */
  valueDesc?: unknown;
}

export interface PushConfigRecord {
  url: string;
  clientId: string;
  username: string;
  password: string;
  /** In seconds. */
  expireTime: number;
  topic: { devId: { sub: string } };
}

/** The data points a device reported, by ID, as one push carries them. */
export interface DeviceReport {
  devId: string;
  dataPoints: DataPoints;
}

/** That a device went online or offline, as one push says. */
export interface DeviceOnline {
  devId: string;
  online: boolean;
}

type Fields = Record<string, unknown>;

// Each reader below throws a `TuyaError` with code `REQUEST_REJECTED` on a
// result that lacks a field the caller goes on to use.

export function readQrCodeResult(result: unknown): QrCodeResult {
  return withStrings(result, ["qrcode"]) as unknown as QrCodeResult;
}

export function readLoginResult(result: unknown): LoginResult {
  const fields = withStrings(result, [
    "access_token",
    "refresh_token",
    "endpoint",
  ]);
  requireSeconds(fields, "expire_time");
  return fields as unknown as LoginResult;
}

export function readRefreshResult(result: unknown): RefreshResult {
  const fields = withStrings(result, ["accessToken", "refreshToken"]);
  requireSeconds(fields, "expireTime");
  return fields as unknown as RefreshResult;
}

export function readHomeRecords(result: unknown): HomeRecord[] {
  const homes = listOf(result, "homes");
  for (const home of homes) {
    if (typeof home.ownerId !== "string" && typeof home.ownerId !== "number") {
      throw malformed("ownerId");
    }
  }
  return homes as unknown as HomeRecord[];
}

export function readDeviceRecords(result: unknown): DeviceRecord[] {
  const devices = listOf(result, "devices");
  for (const device of devices) {
    withStrings(device, ["id"]);
    if (typeof device.online !== "boolean") {
      throw malformed("online");
    }
    if (device.status !== undefined) {
      device.status = listOf(device.status, "status");
    }
  }
  return devices as unknown as DeviceRecord[];
}

export function readStatusRelations(result: unknown): StatusRelation[] {
  const relations = fieldsOf(result, "relations").dpStatusRelationDTOS;
  return relations === undefined
    ? []
    : (listOf(
        relations,
        "dpStatusRelationDTOS",
      ) as unknown as StatusRelation[]);
}

export function readPushConfig(result: unknown): PushConfigRecord {
  const fields = withStrings(result, [
    "url",
    "clientId",
    "username",
    "password",
  ]);
  requireSeconds(fields, "expireTime");
  const topic = fields.topic as { devId?: { sub?: unknown } } | undefined;
  if (typeof topic?.devId?.sub !== "string") {
    throw malformed("topic.devId.sub");
  }
  return fields as unknown as PushConfigRecord;
}

/** Reads a push: a device's data point report, or that a device went online
 * or offline. Returns nothing for any other, such as a device renamed: the
 * payload is the broker's, not a response to a request. */
export function readPush(
  payload: Uint8Array,
): DeviceReport | DeviceOnline | undefined {
  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return undefined;
  }
  if (!isFields(message) || !isFields(message.data)) {
    return undefined;
  }
  const data = message.data;
  if (message.protocol === PROTOCOL_OTHER) {
    const online = data.bizCode === "online";
    if (
      (online || data.bizCode === "offline") &&
      isFields(data.bizData) &&
      typeof data.bizData.devId === "string"
    ) {
      return { devId: data.bizData.devId, online };
    }
    return undefined;
  }
  if (
    message.protocol !== PROTOCOL_DEVICE_REPORT ||
    typeof data.devId !== "string" ||
    !Array.isArray(data.status)
  ) {
    return undefined;
  }
  const dataPoints: Record<string, DataPointValue> = {};
  for (const item of data.status) {
    if (
      isFields(item) &&
      typeof item.dpId === "number" &&
      isDataPointValue(item.value)
    ) {
      dataPoints[String(item.dpId)] = item.value;
    }
  }
  return { devId: data.devId, dataPoints };
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldsOf(value: unknown, name: string): Fields {
  if (!isFields(value)) {
    throw malformed(name);
  }
  return value;
}

function withStrings(value: unknown, names: readonly string[]): Fields {
  const fields = fieldsOf(value, names.join(", "));
  for (const name of names) {
    if (typeof fields[name] !== "string") {
      throw malformed(name);
    }
  }
  return fields;
}

function requireSeconds(fields: Fields, name: string): void {
  const value = fields[name];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw malformed(name);
  }
}

// Source: The cloud answers some successes with a result of "", in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/a83b3887e51070be6e799bd48bbd3e9904752d75.
// A list of "" or null reads as empty, so an account with no homes or a home
// with no devices lists none.
function listOf(value: unknown, name: string): Fields[] {
  if (value === "" || value === null) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isFields)) {
    throw malformed(name);
  }
  return value;
}

function malformed(name: string): TuyaError {
  return new TuyaError(
    "REQUEST_REJECTED",
    `The cloud's answer has no valid ${name}`,
  );
}
