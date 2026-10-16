import { decryptAesEcb, encryptAesEcb } from "./aesEcb.js";
import { addVersionHeader, removeVersionHeader } from "./versionHeader.js";

// Source: AES-128-ECB, the ciphertext sent raw rather than in base64, and the
// header in front of it in the clear are from
// https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db.
/** Encrypts a payload under the local key. The clear header, "3.3" and 12
 * zero bytes, goes in front of the ciphertext unless `command` is
 * `HEART_BEAT`, `DP_QUERY`, `DP_QUERY_NEW` or `UPDATEDPS`: see
 * DESIGN.md#protocol-33. */
export function encryptV33Payload(
  command: number,
  plaintext: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  return addVersionHeader("3.3", command, encryptAesEcb(plaintext, localKey));
}

// Source: An empty payload has nothing to decrypt in
// https://github.com/jasonacox/tinytuya/commit/8528e03565d6dbaeebad372903de0adcfd3d037c.
/** Decrypts a payload from a device. A payload that starts with "3.3" loses
 * its first 15 bytes first, whatever the 12 after "3.3" hold: a device may put
 * a CRC, a sequence number and a source ID there. An empty payload comes back
 * empty. It throws a `TuyaError` with code `DECRYPTION_FAILED` when the
 * padding is wrong, which a wrong key causes for all but about 1 in 256
 * payloads. */
export function decryptV33Payload(
  payload: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  if (payload.length === 0) {
    return Buffer.alloc(0);
  }
  return decryptAesEcb(removeVersionHeader("3.3", payload), localKey);
}
