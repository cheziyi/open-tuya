import { createCipheriv, createHmac, timingSafeEqual } from "node:crypto";

// Source: The device answers the client's nonce with its own nonce and an
// HMAC-SHA256 of the client's under the local key; the client answers with an
// HMAC-SHA256 of the device's, in
// https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b.
export function buildSessionKeyResponse(
  deviceNonce: Uint8Array,
  clientNonce: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  return Buffer.concat([deviceNonce, hmac(localKey, clientNonce)]);
}

export function isSessionKeyFinish(
  payload: Uint8Array,
  deviceNonce: Uint8Array,
  localKey: Uint8Array,
): boolean {
  const expected = hmac(localKey, deviceNonce);
  return (
    payload.length === expected.length && timingSafeEqual(payload, expected)
  );
}

// Source: The session key is the two nonces XORed, then encrypted under the
// local key: with AES-128-ECB and no padding on 3.4, in
// https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e,
// and with AES-128-GCM on 3.5, the first 12 bytes of the client's nonce as the
// IV and the tag dropped, in
// https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb.
export function deriveSessionKey(
  version: "3.4" | "3.5",
  clientNonce: Uint8Array,
  deviceNonce: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  const mixed = Buffer.from(
    clientNonce.map((byte, index) => byte ^ (deviceNonce[index] ?? 0)),
  );
  const cipher =
    version === "3.4"
      ? createCipheriv("aes-128-ecb", localKey, null).setAutoPadding(false)
      : createCipheriv("aes-128-gcm", localKey, clientNonce.subarray(0, 12));
  return Buffer.concat([cipher.update(mixed), cipher.final()]);
}

function hmac(key: Uint8Array, data: Uint8Array): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
