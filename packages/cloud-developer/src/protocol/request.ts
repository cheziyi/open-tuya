import { createHash, createHmac } from "node:crypto";

export interface SignRequestOptions {
  clientId: string;
  secret: string;
  /** Empty for the token request itself. */
  accessToken: string;
  timeInMs: number;
  method: string;
  path: string;
  query?: Readonly<Record<string, string>>;
  /** The exact text of the body sent. */
  body?: string;
}

export interface SignedRequest {
  /** The path and query to send, the query percent-encoded. */
  target: string;
  headers: Record<string, string>;
}

// Source: The signature is the uppercase hex HMAC-SHA256, under the secret,
// of the client ID, the access token, the time in milliseconds, then the
// method, the SHA-256 of the body, the signed headers and the path with its
// query, each on its own line, in
// https://github.com/jasonacox/tinytuya/commit/9bb3656e6421f28b785bc5bd967d1fbf3391338b,
// https://github.com/tuya/tuya-connector-nodejs/commit/9d42acb88625df663b140639298dce6f00241db4
// and https://github.com/tuya/tuya-iot-python-sdk/commit/b3243bf51822307b3cc93b14c2c18eae36d8585b.
// The cloud hashes the body's exact bytes, as captured in
// https://github.com/tuya/tuya-home-assistant/issues/55.
// Source: The query is signed with its keys sorted and its values unencoded,
// in https://github.com/jasonacox/tinytuya/commit/8393e6c71446feb92c4df77f7bd11af0ed1ab777
// and https://github.com/tuya/tuya-connector-nodejs/commit/05c611c4f38c89e1a6f9b38a560028162d783540.
/** Signs a request with no nonce and no signed headers. DESIGN.md#cloud-developer-requests
 * says why. */
export function signRequest(options: SignRequestOptions): SignedRequest {
  const keys = Object.keys(options.query ?? {}).sort();
  const query = (encode: (text: string) => string) =>
    keys.length === 0
      ? ""
      : `?${keys
          .map((key) => `${encode(key)}=${encode(options.query?.[key] ?? "")}`)
          .join("&")}`;
  const signed = [
    options.method,
    createHash("sha256")
      .update(options.body ?? "")
      .digest("hex"),
    "",
    options.path + query((text) => text),
  ].join("\n");
  const sign = createHmac("sha256", options.secret)
    .update(options.clientId + options.accessToken + options.timeInMs + signed)
    .digest("hex")
    .toUpperCase();
  return {
    target: options.path + query(encodeURIComponent),
    headers: {
      client_id: options.clientId,
      sign,
      sign_method: "HMAC-SHA256",
      t: String(options.timeInMs),
      ...(options.accessToken && { access_token: options.accessToken }),
      ...(options.body !== undefined && { "Content-Type": "application/json" }),
    },
  };
}
