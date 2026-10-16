import {
  addVersionHeader,
  removeVersionHeader,
  type VersionHeaderFields,
} from "./versionHeader.js";

// Source: The header goes inside the plaintext GCM encrypts in
// https://github.com/jasonacox/tinytuya/commit/5742dcb99ef3c17d86b31470ed98b1acaed4e739
// and https://github.com/codetheweb/tuyapi/commit/f526710c8d00965f54bbbb76526e10daea0b8641.
/** On `CONTROL` and `CONTROL_NEW`, puts the version header in front of a
 * payload, holding `fields`, which default to zeros. `encodeV35Frame`
 * encrypts the result. */
export function encodeV35Payload(
  command: number,
  plaintext: Uint8Array,
  fields?: VersionHeaderFields,
): Buffer {
  return addVersionHeader("3.5", command, plaintext, fields);
}

/** Drops the first 15 bytes of a payload from `decodeV35Frames` that starts
 * with "3.5". */
export function decodeV35Payload(payload: Uint8Array): Buffer {
  return removeVersionHeader("3.5", payload);
}
