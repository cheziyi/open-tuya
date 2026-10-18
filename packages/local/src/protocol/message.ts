import type { ProtocolVersion, TuyaError } from "@open-tuya/core";
import {
  type DecodedFrames,
  decodeFrames,
  decodeV34Frames,
  encodeFrame,
  encodeV34Frame,
  type ReceivedTuyaFrame,
  type TuyaFrame,
} from "./frame.js";
import { decryptV31Payload, encryptV31Payload } from "./v31Payload.js";
import { decryptV32Payload, encryptV32Payload } from "./v32Payload.js";
import { decryptV33Payload, encryptV33Payload } from "./v33Payload.js";
import { decryptV34Payload, encryptV34Payload } from "./v34Payload.js";
import { decodeV35Frames, encodeV35Frame } from "./v35Frame.js";
import { decodeV35Payload, encodeV35Payload } from "./v35Payload.js";
import type { VersionHeaderFields } from "./versionHeader.js";

/** Encrypts and frames `message.payload`, a plaintext, for a device of
 * `version` under `key`. `iv` is used on 3.5 alone, and `fields` only on
 * `CONTROL` and `CONTROL_NEW` from 3.2 on, which carry the version header. */
export function encodeMessage(
  version: ProtocolVersion,
  message: TuyaFrame,
  key: Uint8Array,
  iv: Uint8Array,
  fields?: VersionHeaderFields,
): Buffer {
  const { command, payload } = message;
  switch (version) {
    case "3.1":
      return encodeFrame({
        ...message,
        payload: encryptV31Payload(command, payload, key),
      });
    case "3.2":
      return encodeFrame({
        ...message,
        payload: encryptV32Payload(command, payload, key, fields),
      });
    case "3.3":
      return encodeFrame({
        ...message,
        payload: encryptV33Payload(command, payload, key, fields),
      });
    case "3.4":
      return encodeV34Frame(
        {
          ...message,
          payload: encryptV34Payload(command, payload, key, fields),
        },
        key,
      );
    case "3.5":
      return encodeV35Frame(
        { ...message, payload: encodeV35Payload(command, payload, fields) },
        key,
        iv,
      );
  }
}

/** Splits the bytes read from a device of `version` into whole frames, and
 * decrypts each payload under `key` with its version header removed. A frame
 * that fails its check or does not decrypt goes in `errors`, and a length
 * field out of range sets `malformed`. */
export function decodeMessages(
  version: ProtocolVersion,
  bytes: Uint8Array,
  key: Uint8Array,
): DecodedFrames {
  switch (version) {
    case "3.1":
      return decryptEach(decodeFrames(bytes), (payload) =>
        decryptV31Payload(payload, key),
      );
    case "3.2":
      return decryptEach(decodeFrames(bytes), (payload) =>
        decryptV32Payload(payload, key),
      );
    case "3.3":
      return decryptEach(decodeFrames(bytes), (payload) =>
        decryptV33Payload(payload, key),
      );
    case "3.4":
      return decryptEach(decodeV34Frames(bytes, key), (payload) =>
        decryptV34Payload(payload, key),
      );
    case "3.5":
      return decryptEach(decodeV35Frames(bytes, key), decodeV35Payload);
  }
}

function decryptEach(
  decoded: DecodedFrames,
  decrypt: (payload: Uint8Array) => Buffer,
): DecodedFrames {
  const frames: ReceivedTuyaFrame[] = [];
  const errors = [...decoded.errors];
  for (const frame of decoded.frames) {
    try {
      frames.push({ ...frame, payload: decrypt(frame.payload) });
    } catch (error) {
      errors.push(error as TuyaError);
    }
  }
  return {
    frames,
    errors,
    remainder: decoded.remainder,
    ...(decoded.malformed && { malformed: decoded.malformed }),
  };
}
