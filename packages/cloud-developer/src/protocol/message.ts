import { createDecipheriv } from "node:crypto";
import { TuyaError } from "@open-tuya/core";

const IV_LENGTH_BYTES = 4;
const TAG_LENGTH = 16;
const KEY_START = 8;
const KEY_END = 24;

// Source: A pushed message's data is the base64 of a 4-byte big-endian IV
// length, the IV, the ciphertext and a 16-byte tag, under AES-128-GCM with the
// 9th to 24th characters of the broker password as the key, in
// https://github.com/tuya/tuya-iot-python-sdk/commit/a7856ac4c05cf6ff15251ce87c8a48222bc28e07
// and https://github.com/tuya/tuya-homebridge/commit/b530a71ae78afc9672c2ce42345749d38605f31c.
// Source: The additional data is the message's `t` as decimal text, which the
// SDK checks the tag against, in
// https://github.com/tuya/tuya-iot-python-sdk/commit/f97d9ea73226efcac36eebf74b080c4d4738518e.
/** Decrypts a pushed message's `data`. It throws a `TuyaError` with code
 * `DECRYPTION_FAILED` when the tag is wrong. */
export function decryptPushData(
  data: string,
  password: string,
  t: number,
): string {
  const bytes = Buffer.from(data, "base64");
  const ivLength =
    bytes.length >= IV_LENGTH_BYTES ? bytes.readUInt32BE(0) : bytes.length;
  const ivEnd = IV_LENGTH_BYTES + ivLength;
  if (bytes.length < ivEnd + TAG_LENGTH) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "The pushed message is too short to decrypt",
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-128-gcm",
      Buffer.from(password.slice(KEY_START, KEY_END)),
      bytes.subarray(IV_LENGTH_BYTES, ivEnd),
    );
    decipher.setAAD(Buffer.from(String(t)));
    decipher.setAuthTag(bytes.subarray(-TAG_LENGTH));
    return Buffer.concat([
      decipher.update(bytes.subarray(ivEnd, -TAG_LENGTH)),
      decipher.final(),
    ]).toString();
  } catch (error) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "The pushed message did not decrypt",
      { cause: error },
    );
  }
}
