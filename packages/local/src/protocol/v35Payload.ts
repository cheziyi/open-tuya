import { addVersionHeader, removeVersionHeader } from "./versionHeader.js";

// Source: The header goes inside the plaintext GCM encrypts in
// https://github.com/jasonacox/tinytuya/commit/5742dcb99ef3c17d86b31470ed98b1acaed4e739
// and https://github.com/codetheweb/tuyapi/commit/f526710c8d00965f54bbbb76526e10daea0b8641.
/** Puts the header, "3.5" and 12 zero bytes, in front of a payload unless
 * `command` goes without it. `encodeV35Frame` encrypts the result. The
 * commands without the header are `SESS_KEY_NEG_START`, `SESS_KEY_NEG_FINISH`,
 * `HEART_BEAT`, `DP_QUERY`, `DP_QUERY_NEW` and `UPDATEDPS`. */
export function encodeV35Payload(
  command: number,
  plaintext: Uint8Array,
): Buffer {
  return addVersionHeader("3.5", command, plaintext);
}

/** Drops the first 15 bytes of a payload from `decodeV35Frames` that starts
 * with "3.5". */
export function decodeV35Payload(payload: Uint8Array): Buffer {
  return removeVersionHeader("3.5", payload);
}
