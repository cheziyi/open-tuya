import { decryptPayload } from "./request.js";

export type CloudResponse =
  | { success: true; result: unknown }
  | { success: false; code: string; message: string };

interface Envelope {
  success?: boolean;
  result?: unknown;
  code?: string | number;
  msg?: string;
}

// Source: A response is `{success, result}`, its result encrypted when
// present, or `{success: false, code, msg}`, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/a83b3887e51070be6e799bd48bbd3e9904752d75.
// Source: The code is a string, such as "-9999999", in
// https://github.com/home-assistant/core/issues/178266#issuecomment-5200735391,
// and sometimes a number, such as 1108, in
// https://github.com/tuya/tuya-device-sharing-sdk/issues/77.
/** Reads a response's envelope. With `key`, it decrypts the result, and
 * parses it as JSON where it is JSON. */
export function parseResponse(value: unknown, key?: Buffer): CloudResponse {
  const envelope = (value ?? {}) as Envelope;
  if (!envelope.success) {
    return {
      success: false,
      code: String(envelope.code ?? ""),
      message: envelope.msg ?? "",
    };
  }
  let result = envelope.result;
  if (key && typeof result === "string" && result !== "") {
    const plaintext = decryptPayload(result, key);
    try {
      result = JSON.parse(plaintext);
    } catch {
      result = plaintext;
    }
  }
  return { success: true, result };
}
