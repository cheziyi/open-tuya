import { createHash } from "node:crypto";
import { TuyaError } from "@open-tuya/core";
import { decryptAesEcb, encryptAesEcb } from "./aesEcb.js";
import { COMMANDS } from "./commands.js";

const VERSION = Buffer.from("3.1");
const SIGNATURE_LENGTH = 16;

// Source: A 3.1 client seals CONTROL alone, as "3.1", 16 hex digits of a
// signature, then the base64 of the payload under AES-128-ECB, and sends
// every other command as plain JSON, in
// https://github.com/clach04/python-tuya/commit/1b0785424ab34c540acb168443aa521a8a2d774b
// and https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/800ade32914c66a60566efbb485268283c8ca86a,
// and a CONTROL so sealed, captured in
// https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765,
// is acked.
/** Seals a payload for a 3.1 device under the local key, on `CONTROL`
 * alone: every other command goes as it is. */
export function encryptV31Payload(
  command: number,
  plaintext: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  if (command !== COMMANDS.CONTROL) {
    return Buffer.from(plaintext);
  }
  const data = encryptAesEcb(plaintext, localKey).toString("base64");
  return Buffer.concat([
    VERSION,
    Buffer.from(sign(data, localKey)),
    Buffer.from(data),
  ]);
}

// Source: A 3.1 device sends a query reply and an error as plain text, and a
// STATUS sealed as a client seals CONTROL, in
// https://github.com/clach04/python-tuya/commit/8d70404fb38cf2144c60329678b8f6bb84a8720d,
// captured in https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247504813.
/** Opens a payload from a 3.1 device. A payload that starts with "3.1" is
 * sealed: it throws a `TuyaError` with code `DECRYPTION_FAILED` when its
 * signature is wrong or it does not decrypt, as a wrong local key causes.
 * Any other payload is plain text, and comes back as it is. */
export function decryptV31Payload(
  payload: Uint8Array,
  localKey: Uint8Array,
): Buffer {
  const bytes = Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  if (!bytes.subarray(0, VERSION.length).equals(VERSION)) {
    return bytes;
  }
  const signature = bytes
    .subarray(VERSION.length, VERSION.length + SIGNATURE_LENGTH)
    .toString();
  const data = bytes.subarray(VERSION.length + SIGNATURE_LENGTH).toString();
  if (signature !== sign(data, localKey)) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "A payload's signature is wrong: check the local key and the protocol version",
    );
  }
  return decryptAesEcb(Buffer.from(data, "base64"), localKey);
}

// Source: The signature is hex digits 8 to 24 of the MD5 of
// "data=" + base64 + "||lpv=3.1||" + local key, in
// https://github.com/codetheweb/tuyapi/commit/5a83350de1941ff35f8a3645b47e2706fc045aa3
// and https://github.com/clach04/python-tuya/commit/1b0785424ab34c540acb168443aa521a8a2d774b;
// a device signs its STATUS the same way, captured in
// https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765.
function sign(data: string, localKey: Uint8Array): string {
  return createHash("md5")
    .update(`data=${data}||lpv=3.1||`)
    .update(localKey)
    .digest("hex")
    .slice(8, 8 + SIGNATURE_LENGTH);
}
