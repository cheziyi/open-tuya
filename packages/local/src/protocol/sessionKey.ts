import { createCipheriv, createHmac } from "node:crypto";
import { TuyaError } from "@open-tuya/core";

const NONCE_LENGTH = 16;
const HMAC_LENGTH = 32;
const V35_IV_LENGTH = 12;

// Source: The device answers SESS_KEY_NEG_START with its own nonce and an
// HMAC-SHA256 of the client's under the local key, and a wrong HMAC ends the
// negotiation, in
// https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
/** Reads the device's nonce from its reply to `SESS_KEY_NEG_START`, the
 * decrypted payload of a `SESS_KEY_NEG_RESP` frame. It throws a `TuyaError`
 * with code `SESSION_KEY_NEGOTIATION_FAILED` when the payload is under 48
 * bytes, or its HMAC of `localNonce` is not one under `localKey`. */
export function parseSessionKeyResponse(
  payload: Uint8Array,
  localNonce: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  const bytes = Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  if (bytes.length < NONCE_LENGTH + HMAC_LENGTH) {
    throw new TuyaError(
      "SESSION_KEY_NEGOTIATION_FAILED",
      `The device's session key reply is ${bytes.length} bytes, under ${NONCE_LENGTH + HMAC_LENGTH}`,
    );
  }
  const signature = bytes.subarray(NONCE_LENGTH, NONCE_LENGTH + HMAC_LENGTH);
  if (!hmacSha256(localKey, localNonce).equals(signature)) {
    throw new TuyaError(
      "SESSION_KEY_NEGOTIATION_FAILED",
      "The device's session key reply has the wrong HMAC: check the local key",
    );
  }
  return bytes.subarray(0, NONCE_LENGTH);
}

// Source: SESS_KEY_NEG_FINISH carries an HMAC-SHA256 of the device's nonce
// under the local key in
// https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
/** Builds the payload of `SESS_KEY_NEG_FINISH`. */
export function buildSessionKeyFinish(
  remoteNonce: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  return hmacSha256(localKey, remoteNonce);
}

// Source: The 3.4 session key is the two nonces XORed and encrypted with
// AES-128-ECB under the local key, unpadded, in
// https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
export function deriveV34SessionKey(
  localNonce: Uint8Array,
  remoteNonce: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  const cipher = createCipheriv("aes-128-ecb", localKey, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([
    cipher.update(xorNonces(localNonce, remoteNonce)),
    cipher.final(),
  ]);
}

// Source: The 3.5 session key is the ciphertext of the two nonces XORed,
// encrypted with AES-128-GCM under the local key with the first 12 bytes of
// the client's nonce as the IV, without the tag, in
// https://github.com/jasonacox/tinytuya/commit/7bf97205555062acc048e2a3adeea3628fb35c25,
// https://github.com/jasonacox/tinytuya/commit/c2f3e24d968c5d23ffd4e71956b46028563f422f
// and https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb.
export function deriveV35SessionKey(
  localNonce: Uint8Array,
  remoteNonce: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  const cipher = createCipheriv(
    "aes-128-gcm",
    localKey,
    localNonce.subarray(0, V35_IV_LENGTH),
  );
  return Buffer.concat([
    cipher.update(xorNonces(localNonce, remoteNonce)),
    cipher.final(),
  ]);
}

function xorNonces(localNonce: Uint8Array, remoteNonce: Uint8Array): Buffer {
  if (
    localNonce.length !== NONCE_LENGTH ||
    remoteNonce.length !== NONCE_LENGTH
  ) {
    throw new RangeError(`A nonce is ${NONCE_LENGTH} bytes`);
  }
  return Buffer.from(
    localNonce.map((byte, index) => byte ^ (remoteNonce[index] ?? 0)),
  );
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
