import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto";
import { TuyaError } from "@open-tuya/core";

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCRYPTION_KEY_LENGTH = 16;
// Source: The headers are signed in this order, each left out while empty, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
const SIGNED_HEADERS = [
  "X-appKey",
  "X-requestId",
  "X-sid",
  "X-time",
  "X-token",
] as const;

export interface RequestKeys {
  /** The key `X-sign` is computed under. */
  signingKey: string;
  /** The AES-128-GCM key the query, the body and the response's result are
   * encrypted under. */
  encryptionKey: Buffer;
}

// Source: The signing key is the MD5 of the request ID and the refresh token,
// in hex, and the encryption key the first 16 hex characters of its
// HMAC-SHA256 under the request ID, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
/** Derives the keys of one request from its ID. */
export function deriveRequestKeys(
  requestId: string,
  refreshToken: string,
): RequestKeys {
  const signingKey = createHash("md5")
    .update(requestId + refreshToken)
    .digest("hex");
  const encryptionKey = Buffer.from(
    createHmac("sha256", requestId)
      .update(signingKey)
      .digest("hex")
      .slice(0, ENCRYPTION_KEY_LENGTH),
  );
  return { signingKey, encryptionKey };
}

// Source: An encrypted payload is the base64 of the 12-byte nonce, the
// ciphertext and the 16-byte tag, with no additional data, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
// The SDK joins the base64 of the nonce to the base64 of the ciphertext and
// tag, which is the base64 of all three only because 12 bytes divide by 3 and
// so leave the nonce's base64 unpadded.
/** Encrypts `plaintext` under `key` with AES-128-GCM. The cloud reads the
 * 12-byte `nonce` from the result, so it must never repeat under one key. */
export function encryptPayload(
  plaintext: string,
  key: Buffer,
  nonce: Buffer,
): string {
  const cipher = createCipheriv("aes-128-gcm", key, nonce);
  return Buffer.concat([
    nonce,
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}

/** Decrypts what `encryptPayload` produced. It throws a `TuyaError` with code
 * `DECRYPTION_FAILED` when the tag is wrong. */
export function decryptPayload(encrypted: string, key: Buffer): string {
  const bytes = Buffer.from(encrypted, "base64");
  if (bytes.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "The cloud's response is too short to decrypt",
    );
  }
  const decipher = createDecipheriv(
    "aes-128-gcm",
    key,
    bytes.subarray(0, NONCE_LENGTH),
  );
  decipher.setAuthTag(bytes.subarray(-TAG_LENGTH));
  try {
    return Buffer.concat([
      decipher.update(bytes.subarray(NONCE_LENGTH, -TAG_LENGTH)),
      decipher.final(),
    ]).toString();
  } catch (error) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "The cloud's response did not decrypt",
      { cause: error },
    );
  }
}

export interface EncryptedPart {
  data: Readonly<Record<string, unknown>>;
  /** 12 bytes, drawn afresh for each part. */
  nonce: Buffer;
}

export interface SignRequestOptions {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  requestId: string;
  timeInMs: number;
  query?: EncryptedPart;
  body?: EncryptedPart;
}

export interface SignedRequest {
  headers: Record<string, string>;
  /** The value of the query's one parameter, `encdata`. */
  query?: string;
  /** The JSON text of the body. */
  body?: string;
  /** The key the response's result is encrypted under. */
  encryptionKey: Buffer;
}

// Source: The query and the body are each sent as `encdata`, the encrypted
// compact JSON of the parameters, and `X-sign` is the HMAC-SHA256 of the
// signed headers as `name=value` joined by `||`, then the query's `encdata`
// and the body's, under the signing key, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
/** Encrypts a request's query and body, and signs it. A part with no
 * parameters is left out. */
export function signRequest(options: SignRequestOptions): SignedRequest {
  const { signingKey, encryptionKey } = deriveRequestKeys(
    options.requestId,
    options.refreshToken,
  );
  const query = encryptPart(options.query, encryptionKey);
  const body = encryptPart(options.body, encryptionKey);
  const headers: Record<string, string> = {
    "X-appKey": options.clientId,
    "X-requestId": options.requestId,
    "X-sid": "",
    "X-time": String(options.timeInMs),
    ...(options.accessToken && { "X-token": options.accessToken }),
  };
  const signed =
    SIGNED_HEADERS.filter((name) => headers[name])
      .map((name) => `${name}=${headers[name]}`)
      .join("||") +
    (query ?? "") +
    (body ?? "");
  headers["X-sign"] = createHmac("sha256", signingKey)
    .update(signed)
    .digest("hex");
  return {
    headers,
    ...(query && { query }),
    ...(body && { body: JSON.stringify({ encdata: body }) }),
    encryptionKey,
  };
}

function encryptPart(
  part: EncryptedPart | undefined,
  key: Buffer,
): string | undefined {
  if (!part || Object.keys(part.data).length === 0) {
    return undefined;
  }
  return encryptPayload(JSON.stringify(part.data), key, part.nonce);
}
