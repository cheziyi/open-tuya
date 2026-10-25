import { COMMANDS } from "./commands.js";
import type { DataPointRequest } from "./dataPoints.js";

/** What a gateway reports of the devices behind it, by node ID. */
export interface SubDeviceStatus {
  online: readonly string[];
  offline: readonly string[];
}

// Source: A gateway takes {"data":{"cids":[]},"reqType":"subdev_online_stat_query"}
// on LAN_EXT_STREAM, with no version header, in
// https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b.
/** Builds the request that asks a gateway which devices behind it are
 * online. */
export function buildSubDeviceStatusQuery(): DataPointRequest {
  return {
    command: COMMANDS.LAN_EXT_STREAM,
    plaintext: Buffer.from(
      JSON.stringify({
        data: { cids: [] },
        reqType: "subdev_online_stat_query",
      }),
    ),
  };
}

// Source: A gateway answers with one or more
// {"reqType":"subdev_online_stat_report","data":{"online":[…],"offline":[…]}},
// some adding "nearby", captured in
// https://github.com/xZetsubou/hass-localtuya/issues/227#issuecomment-2112020068,
// https://github.com/xZetsubou/hass-localtuya/issues/244 and
// https://github.com/jasonacox/tinytuya/issues/435.
// Source: A 3.4 gateway sends an empty frame before its report, captured in
// https://github.com/jasonacox/tinytuya/issues/677.
/** Reads a gateway's report of the devices behind it out of a decrypted
 * payload. It returns `undefined` for any other payload, such as the empty
 * frame a 3.4 gateway sends before its report. */
export function parseSubDeviceStatus(
  payload: Uint8Array,
): SubDeviceStatus | undefined {
  let message: unknown;
  try {
    message = JSON.parse(Buffer.from(payload).toString());
  } catch {
    return undefined;
  }
  if (
    typeof message !== "object" ||
    message === null ||
    (message as Record<string, unknown>).reqType !== "subdev_online_stat_report"
  ) {
    return undefined;
  }
  const data = (message as Record<string, unknown>).data as
    | Record<string, unknown>
    | undefined;
  return { online: nodeIds(data?.online), offline: nodeIds(data?.offline) };
}

function nodeIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
