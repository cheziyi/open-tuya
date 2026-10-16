import { createCipheriv, createDecipheriv } from "node:crypto";
import { TuyaError } from "@open-tuya/core";
import { COMMANDS } from "./commands.js";

const V33_VERSION = Buffer.from("3.3");
const V33_HEADER = Buffer.concat([V33_VERSION, Buffer.alloc(12)]);

// Source: HEART_BEAT, DP_QUERY and UPDATEDPS go without the header in
// https://github.com/jasonacox/tinytuya/commit/0c68f4b4d40c16fb82586a37afe43588116920e4,
// HEART_BEAT and DP_QUERY in
// https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6,
// and UPDATEDPS in
// https://github.com/codetheweb/tuyapi/commit/4be9cc5de3048ab0f5eb97674ca964112d1d9452.
const COMMANDS_WITHOUT_V33_HEADER: ReadonlySet<number> = new Set([
  COMMANDS.HEART_BEAT,
  COMMANDS.DP_QUERY,
  COMMANDS.UPDATEDPS,
]);

// Source: AES-128-ECB, the ciphertext sent raw rather than in base64, and the
// header in front of it in the clear are from
// https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db.
/** Encrypts a payload under the local key. The clear header, "3.3" and 12
 * zero bytes, goes in front of the ciphertext unless `command` is
 * `HEART_BEAT`, `DP_QUERY` or `UPDATEDPS`: see DESIGN.md#protocol-33. */
export function encryptV33Payload(
  command: number,
  plaintext: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  const cipher = createCipheriv("aes-128-ecb", localKey, null);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return COMMANDS_WITHOUT_V33_HEADER.has(command)
    ? ciphertext
    : Buffer.concat([V33_HEADER, ciphertext]);
}

// Source: A payload that starts with "3.3" loses 15 bytes in
// https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db
// and https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a.
// Source: An empty payload has nothing to decrypt, and one that does not
// decrypt is an error, in
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
  const bytes = Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const ciphertext = bytes.subarray(0, V33_VERSION.length).equals(V33_VERSION)
    ? bytes.subarray(V33_HEADER.length)
    : bytes;
  const decipher = createDecipheriv("aes-128-ecb", localKey, null);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "A payload did not decrypt: check the local key and the protocol version",
      { cause: error },
    );
  }
}
