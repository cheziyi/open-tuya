import type { DataPoints, ProtocolVersion } from "@open-tuya/core";
import { COMMANDS } from "./commands.js";

/** The versions a gateway reaches the devices behind it on: no source shows
 * a 3.1 or 3.2 gateway. */
export type GatewayProtocolVersion = Exclude<ProtocolVersion, "3.1" | "3.2">;

export interface DataPointRequest {
  command: number;
  plaintext: Buffer;
}

// Source: 3.3 reads with DP_QUERY and writes with CONTROL; 3.4 and 3.5 read
// with DP_QUERY_NEW and write with CONTROL_NEW, in
// https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e,
// https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb,
// https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a
// and https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f.
// Source: 3.1 reads with DP_QUERY and writes with CONTROL, in
// https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674
// and https://github.com/clach04/python-tuya/commit/1b0785424ab34c540acb168443aa521a8a2d774b.
// Source: The 3.1 to 3.3 body is {"gwId":…,"devId":…}, both the device ID, in
// https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a
// and https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674.
// Source: The 3.4 and 3.5 body is {} in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b.
/** Builds the request that reads a device's data points. */
export function buildQuery(
  version: ProtocolVersion,
  deviceId: string,
): DataPointRequest {
  return isV3x(version)
    ? {
        command: COMMANDS.DP_QUERY,
        plaintext: json({ devId: deviceId, gwId: deviceId }),
      }
    : { command: COMMANDS.DP_QUERY_NEW, plaintext: json({}) };
}

// Source: The 3.1 to 3.3 body is {"devId":…,"uid":"","t":…,"dps":…} in
// https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a
// and https://github.com/codetheweb/tuyapi/commit/68b164d5c62e902eb7407945aef71e3a3f2cb065,
// with "t" an integer of seconds in
// https://github.com/codetheweb/tuyapi/commit/461f0b3ea7887ec240c4c191dc3036b8f47981cb:
// see DESIGN.md#data-points. On 3.1, "t" is a string, in
// https://github.com/clach04/python-tuya/commit/ba17258746effadadc0e8e990d05b54efffabfe8
// and https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a,
// and captured acked in
// https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765:
// see DESIGN.md#protocol-31.
// Source: The 3.4 and 3.5 body is {"data":{"dps":…},"protocol":5,"t":…},
// with "t" an integer, in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b,
// and a device reads only "dps" and "devId" from "data", in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
/** Builds the request that writes `dataPoints`, stamped `timeInSeconds`. */
export function buildControl(
  version: ProtocolVersion,
  deviceId: string,
  dataPoints: DataPoints,
  timeInSeconds: number,
): DataPointRequest {
  const t = Math.floor(timeInSeconds);
  return isV3x(version)
    ? {
        command: COMMANDS.CONTROL,
        plaintext: json({
          devId: deviceId,
          dps: dataPoints,
          t: version === "3.1" ? String(t) : t,
          uid: "",
        }),
      }
    : {
        command: COMMANDS.CONTROL_NEW,
        plaintext: json({
          data: { dps: dataPoints },
          protocol: 5,
          t,
        }),
      };
}

// Source: A client reads by writing null with CONTROL in
// https://github.com/codetheweb/tuyapi/commit/fc0eb599444ff7d129ddd3e76fbad3e5bb2c16a8,
// and a 3.3 device reported the data points a CONTROL named with null values
// in a STATUS, captured in
// https://github.com/TuyaAPI/cli/issues/109#issuecomment-767903303. A 3.2
// device did the same for a CONTROL_NEW, captured in
// https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394:
// see DESIGN.md#reading-by-writing-null.
/** Builds the request that reads `dataPoints` of a 3.2 or 3.3 device by
 * writing null to each, stamped `timeInSeconds`: the write body, each value
 * null. */
export function buildNullRead(
  deviceId: string,
  dataPoints: readonly string[],
  timeInSeconds: number,
): DataPointRequest {
  return {
    command: COMMANDS.CONTROL,
    plaintext: json({
      devId: deviceId,
      dps: Object.fromEntries(dataPoints.map((id) => [id, null])),
      t: Math.floor(timeInSeconds),
      uid: "",
    }),
  };
}

// Source: A gateway takes a read of a device behind it as DP_QUERY_NEW
// {"cid":…}, on 3.4 and 3.5 in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b,
// and a 3.3 gateway answered one, captured in
// https://github.com/jasonacox/tinytuya/issues/302#issuecomment-1474957230:
// see DESIGN.md#gateways.
/** Builds the request that reads the data points of the device behind a
 * gateway with `nodeId`. */
export function buildSubDeviceQuery(nodeId: string): DataPointRequest {
  return { command: COMMANDS.DP_QUERY_NEW, plaintext: json({ cid: nodeId }) };
}

// Source: A gateway takes a write to a device behind it as CONTROL_NEW
// {"data":{"cid":…,"ctype":0,"dps":…},"protocol":5,"t":…} on 3.4 and 3.5, in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e,
// as captured acked in https://github.com/jasonacox/tinytuya/issues/677.
// On 3.3 it goes as CONTROL_NEW {"cid":…,"ctype":0,"dps":…}, the same body
// outside "data", where the sources send CONTROL {"t":…,"cid":…,"dps":…}: a
// 3.3 device acked a CONTROL_NEW, captured in
// https://github.com/TuyaAPI/cli/issues/109#issuecomment-768668877, and a 3.3
// gateway answered a DP_QUERY_NEW naming a cid, captured in
// https://github.com/jasonacox/tinytuya/issues/302#issuecomment-1474957230:
// see DESIGN.md#gateways.
/** Builds the request that writes `dataPoints` to the device behind a
 * gateway with `nodeId`, stamped `timeInSeconds` on 3.4 and 3.5. */
export function buildSubDeviceControl(
  version: GatewayProtocolVersion,
  nodeId: string,
  dataPoints: DataPoints,
  timeInSeconds: number,
): DataPointRequest {
  const data = { cid: nodeId, ctype: 0, dps: dataPoints };
  return {
    command: COMMANDS.CONTROL_NEW,
    plaintext: json(
      version === "3.3"
        ? data
        : { data, protocol: 5, t: Math.floor(timeInSeconds) },
    ),
  };
}

// Source: A reply carries {"dps":…} and a 3.4 or 3.5 push {"data":{"dps":…}},
// in https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
// Source: A gateway names the device behind it a report is from at "cid",
// at the top on a reply, captured in
// https://github.com/jasonacox/tinytuya/issues/266 and
// https://github.com/make-all/tuya-local/issues/3827, and on a 3.3 push,
// captured in https://github.com/xZetsubou/hass-localtuya/issues/37, and in
// "data" on a 3.4 push, captured in
// https://github.com/make-all/tuya-local/issues/6400; tinytuya reads both in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b.
/** Reads the data points out of a decrypted payload, at `dps` or
 * `data.dps`, with the node ID of the device behind a gateway they are from,
 * at `cid` or `data.cid`. It returns `undefined` for a payload that is not
 * JSON or holds no data points. */
export function parseReport(
  payload: Uint8Array,
): { dataPoints: DataPoints; nodeId?: string } | undefined {
  let message: unknown;
  try {
    message = JSON.parse(Buffer.from(payload).toString());
  } catch {
    return undefined;
  }
  const data = field(message, "data");
  const dataPoints = field(message, "dps") ?? field(data, "dps");
  if (!isObject(dataPoints)) {
    return undefined;
  }
  const nodeId = field(message, "cid") ?? field(data, "cid");
  return {
    dataPoints: dataPoints as DataPoints,
    ...(typeof nodeId === "string" && { nodeId }),
  };
}

/** Reads the data points out of a decrypted payload, at `dps` or
 * `data.dps`. It returns `undefined` for a payload that is not JSON or holds
 * neither. */
export function parseDataPoints(payload: Uint8Array): DataPoints | undefined {
  return parseReport(payload)?.dataPoints;
}

function isV3x(version: ProtocolVersion): boolean {
  return version === "3.1" || version === "3.2" || version === "3.3";
}

// Source: A device does not answer a body with spaces between its tokens, in
// https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674.
// JSON.stringify writes none, and keeps the spaces inside a string value.
// Each body above lists its keys in alphabetical order: see
// DESIGN.md#data-points.
function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function field(value: unknown, name: string): unknown {
  return isObject(value) ? value[name] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
