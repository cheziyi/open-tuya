import type { DataPoints, ProtocolVersion } from "@open-tuya/core";
import { COMMANDS } from "./commands.js";

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
// Source: The 3.3 body is {"gwId":…,"devId":…}, both the device ID, in
// https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a
// and https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674.
// Source: The 3.4 and 3.5 body is {} in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b.
/** Builds the request that reads a device's data points. */
export function buildQuery(
  version: ProtocolVersion,
  deviceId: string,
): DataPointRequest {
  return version === "3.3"
    ? {
        command: COMMANDS.DP_QUERY,
        plaintext: json({ devId: deviceId, gwId: deviceId }),
      }
    : { command: COMMANDS.DP_QUERY_NEW, plaintext: json({}) };
}

// Source: The 3.3 body is {"devId":…,"uid":"","t":…,"dps":…} in
// https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a
// and https://github.com/codetheweb/tuyapi/commit/68b164d5c62e902eb7407945aef71e3a3f2cb065,
// with "t" an integer of seconds in
// https://github.com/codetheweb/tuyapi/commit/461f0b3ea7887ec240c4c191dc3036b8f47981cb:
// see DESIGN.md#data-points.
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
  return version === "3.3"
    ? {
        command: COMMANDS.CONTROL,
        plaintext: json({
          devId: deviceId,
          dps: dataPoints,
          t,
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

// Source: A reply carries {"dps":…} and a 3.4 or 3.5 push {"data":{"dps":…}},
// in https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
/** Reads the data points out of a decrypted payload, at `dps` or
 * `data.dps`. It returns `undefined` for a payload that is not JSON or holds
 * neither. */
export function parseDataPoints(payload: Uint8Array): DataPoints | undefined {
  let message: unknown;
  try {
    message = JSON.parse(Buffer.from(payload).toString());
  } catch {
    return undefined;
  }
  const dataPoints =
    field(message, "dps") ?? field(field(message, "data"), "dps");
  return isObject(dataPoints) ? (dataPoints as DataPoints) : undefined;
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
