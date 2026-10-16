import type { ProtocolVersion } from "@open-tuya/core";
import { COMMANDS } from "./commands.js";

const HEADER_LENGTH = 15;

// Source: All six commands go without the header on every version in
// https://github.com/jasonacox/tinytuya/commit/0c68f4b4d40c16fb82586a37afe43588116920e4,
// and on 3.4 and 3.5 in
// https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
// On 3.3, HEART_BEAT and DP_QUERY go without it in
// https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6,
// and DP_QUERY and UPDATEDPS in
// https://github.com/codetheweb/tuyapi/commit/4be9cc5de3048ab0f5eb97674ca964112d1d9452.
const COMMANDS_WITHOUT_VERSION_HEADER: ReadonlySet<number> = new Set([
  COMMANDS.SESS_KEY_NEG_START,
  COMMANDS.SESS_KEY_NEG_FINISH,
  COMMANDS.HEART_BEAT,
  COMMANDS.DP_QUERY,
  COMMANDS.DP_QUERY_NEW,
  COMMANDS.UPDATEDPS,
]);

/** Puts the version and 12 zero bytes in front of `payload`, unless the
 * command goes without them. */
export function addVersionHeader(
  version: ProtocolVersion,
  command: number,
  payload: Uint8Array,
): Buffer {
  return COMMANDS_WITHOUT_VERSION_HEADER.has(command)
    ? Buffer.from(payload)
    : Buffer.concat([
        Buffer.from(version),
        Buffer.alloc(HEADER_LENGTH - version.length),
        payload,
      ]);
}

// Source: A payload that starts with the version loses 15 bytes in
// https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db
// and https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a.
/** Drops the first 15 bytes of a payload that starts with the version,
 * whatever the 12 after the version hold: a device may put a CRC, a sequence
 * number and a source ID there. */
export function removeVersionHeader(
  version: ProtocolVersion,
  payload: Uint8Array,
): Buffer {
  const bytes = Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  return bytes.subarray(0, version.length).equals(Buffer.from(version))
    ? bytes.subarray(HEADER_LENGTH)
    : bytes;
}
