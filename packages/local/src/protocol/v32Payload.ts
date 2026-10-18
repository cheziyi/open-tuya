import { decryptAesEcb, encryptAesEcb } from "./aesEcb.js";
import { COMMANDS } from "./commands.js";
import {
  addVersionHeader,
  removeVersionHeader,
  type VersionHeaderFields,
} from "./versionHeader.js";

const VERSION = Buffer.from("3.2");

// Source: A 3.2 client seals CONTROL and CONTROL_NEW as 3.3 does, with "3.2"
// in the version header, in
// https://github.com/jasonacox/tinytuya/commit/12483f4847f78079a59a5a54d13ce79c098a8e35,
// and a CONTROL_NEW so sealed, captured in
// https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394,
// is acked. A 3.2 device answers an encrypted DP_QUERY with "data format
// error", captured in https://github.com/jasonacox/tinytuya/issues/168, and
// every other command goes in plain text, as on 3.1.
/** Seals a payload for a 3.2 device under the local key, on `CONTROL` and
 * `CONTROL_NEW` alone, with the version header in front holding `fields`:
 * every other command goes as it is. */
export function encryptV32Payload(
  command: number,
  plaintext: Uint8Array,
  localKey: Uint8Array,
  fields?: VersionHeaderFields,
): Buffer {
  if (command !== COMMANDS.CONTROL && command !== COMMANDS.CONTROL_NEW) {
    return Buffer.from(plaintext);
  }
  return addVersionHeader(
    "3.2",
    command,
    encryptAesEcb(plaintext, localKey),
    fields,
  );
}

// Source: A 3.2 device sends its STATUS with "3.2" in the version header and
// the rest under AES-128-ECB, captured in
// https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394,
// and an error in plain text, captured in
// https://github.com/jasonacox/tinytuya/issues/168.
/** Opens a payload from a 3.2 device. A payload that starts with "3.2" loses
 * its version header and is decrypted: it throws a `TuyaError` with code
 * `DECRYPTION_FAILED` when it does not decrypt. Any other payload is plain
 * text, and comes back as it is. */
export function decryptV32Payload(
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
  return decryptAesEcb(removeVersionHeader("3.2", bytes), localKey);
}
