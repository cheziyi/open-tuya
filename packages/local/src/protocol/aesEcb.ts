import { createCipheriv, createDecipheriv } from "node:crypto";
import { TuyaError } from "@open-tuya/core";

export function encryptAesEcb(plaintext: Uint8Array, key: Uint8Array): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

// Source: A payload that does not decrypt is an error in
// https://github.com/jasonacox/tinytuya/commit/8528e03565d6dbaeebad372903de0adcfd3d037c.
export function decryptAesEcb(ciphertext: Uint8Array, key: Uint8Array): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "A payload did not decrypt: check the local key, the session key and the protocol version",
      { cause: error },
    );
  }
}
