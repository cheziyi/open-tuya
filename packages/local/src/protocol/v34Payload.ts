import { decryptAesEcb, encryptAesEcb } from "./aesEcb.js";
import {
  addVersionHeader,
  removeVersionHeader,
  type VersionHeaderFields,
} from "./versionHeader.js";

// Source: The header goes inside the ciphertext in
// https://github.com/jasonacox/tinytuya/commit/a60ffc61484b164f588e2e6685810cfbd262de8f
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e,
// and a payload already a whole number of blocks long gains a full block of
// padding in both.
// An empty payload, such as a heartbeat's, is sent as no bytes rather than as
// a block of padding: see DESIGN.md#protocol-34-and-35.
/** On `CONTROL` and `CONTROL_NEW`, puts the version header in front of a
 * payload, holding `fields`, which default to zeros. It then encrypts the
 * whole under `key`: the local key during the session key negotiation, and
 * the session key after it. An empty payload comes back empty. */
export function encryptV34Payload(
  command: number,
  plaintext: Uint8Array,
  key: Uint8Array,
  fields?: VersionHeaderFields,
): Buffer {
  const payload = addVersionHeader("3.4", command, plaintext, fields);
  return payload.length === 0 ? payload : encryptAesEcb(payload, key);
}

// Source: A device sends an empty payload as an acknowledgement in
// https://github.com/jasonacox/tinytuya/commit/8528e03565d6dbaeebad372903de0adcfd3d037c.
/** Decrypts a payload from a device under `key`, then drops the first 15
 * bytes of a plaintext that starts with "3.4". An empty payload comes back
 * empty. It throws a `TuyaError` with code `DECRYPTION_FAILED` when the
 * padding is wrong. */
export function decryptV34Payload(
  payload: Uint8Array,
  key: Uint8Array,
): Buffer {
  if (payload.length === 0) {
    return Buffer.alloc(0);
  }
  return removeVersionHeader("3.4", decryptAesEcb(payload, key));
}
