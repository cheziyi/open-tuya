import type { ProtocolVersion } from "@open-tuya/core";
import { COMMANDS } from "./commands.js";

const HEADER_LENGTH = 15;

/** The two numbers a sender puts in the version header: a serial number it
 * raises with each frame that carries the header, and an ID of its own. */
export interface VersionHeaderFields {
  serialNumber: number;
  sourceId: number;
}

// Source: A device reads the header on CONTROL and CONTROL_NEW alone, as the
// version, a CRC, a serial number and a source ID, and uses none of them, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
// It reads a query as plain JSON, which a header would break.
const COMMANDS_WITH_VERSION_HEADER: ReadonlySet<number> = new Set([
  COMMANDS.CONTROL,
  COMMANDS.CONTROL_NEW,
]);

/** Puts the version header in front of `payload` when `command` is `CONTROL`
 * or `CONTROL_NEW`: the version, a zero CRC, then `fields`. `fields` defaults
 * to zeros. */
export function addVersionHeader(
  version: ProtocolVersion,
  command: number,
  payload: Uint8Array,
  fields: VersionHeaderFields = { serialNumber: 0, sourceId: 0 },
): Buffer {
  if (!COMMANDS_WITH_VERSION_HEADER.has(command)) {
    return Buffer.from(payload);
  }
  const header = Buffer.alloc(HEADER_LENGTH);
  header.write(version);
  header.writeUInt32BE(fields.serialNumber, HEADER_LENGTH - 8);
  header.writeUInt32BE(fields.sourceId, HEADER_LENGTH - 4);
  return Buffer.concat([header, payload]);
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
