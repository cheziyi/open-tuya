import { createCipheriv, createDecipheriv } from "node:crypto";
import { TuyaError } from "@open-tuya/core";
import type { DecodedFrames, TuyaFrame } from "./frame.js";
import { splitFrames } from "./splitFrames.js";

const PREFIX = 0x00006699;
const PREFIX_BYTES = Buffer.from("00006699", "hex");
const SUFFIX_BYTES = Buffer.from("00009966", "hex");
const HEADER_LENGTH = 18;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const RETURN_CODE_LENGTH = 4;

// Source: The 0x6699 header, a length field counting the IV, the ciphertext
// and the tag, and AES-128-GCM over the payload with the 14 header bytes after
// the prefix as its additional data, are from
// https://github.com/jasonacox/tinytuya/commit/5742dcb99ef3c17d86b31470ed98b1acaed4e739
// and https://github.com/codetheweb/tuyapi/commit/f526710c8d00965f54bbbb76526e10daea0b8641.
/** Frames and encrypts a payload for a 3.5 device under `key`: the local key
 * during the session key negotiation, and the session key after it. `iv` is
 * the 12 bytes GCM takes, which must differ for every frame under one key. */
export function encodeV35Frame(
  frame: TuyaFrame,
  key: Uint8Array,
  iv: Uint8Array,
): Buffer {
  if (iv.length !== IV_LENGTH) {
    throw new RangeError(`The IV is ${iv.length} bytes, not ${IV_LENGTH}`);
  }
  const header = Buffer.alloc(HEADER_LENGTH);
  header.writeUInt32BE(PREFIX, 0);
  header.writeUInt32BE(frame.sequenceNumber, 6);
  header.writeUInt32BE(frame.command, 10);
  header.writeUInt32BE(IV_LENGTH + frame.payload.length + TAG_LENGTH, 14);
  const cipher = createCipheriv("aes-128-gcm", key, iv);
  cipher.setAAD(header.subarray(4));
  const ciphertext = Buffer.concat([
    cipher.update(frame.payload),
    cipher.final(),
  ]);
  return Buffer.concat([
    header,
    iv,
    ciphertext,
    cipher.getAuthTag(),
    SUFFIX_BYTES,
  ]);
}

// Source: The return code is the first 4 bytes of the plaintext of every frame
// a device sends in
// https://github.com/jasonacox/tinytuya/commit/c2f3e24d968c5d23ffd4e71956b46028563f422f
// and https://github.com/codetheweb/tuyapi/commit/96af23b59f5dac4a10ef81afd8cc94e85b1ed6d9.
/** Splits the bytes read from a 3.5 device into whole frames and decrypts
 * each under `key`: the local key during the session key negotiation, and
 * the session key after it. The remainder is a view of `bytes`, not a copy.
 * It throws a `TuyaError` with code `MALFORMED_FRAME` for a length field
 * under 32 or over 1440, and `DECRYPTION_FAILED` for a wrong tag. */
export function decodeV35Frames(
  bytes: Uint8Array,
  key: Uint8Array,
): DecodedFrames {
  const { frames, remainder } = splitFrames(bytes, {
    prefix: PREFIX_BYTES,
    lengthOffset: 14,
    uncountedLength: HEADER_LENGTH + SUFFIX_BYTES.length,
    minLength: IV_LENGTH + RETURN_CODE_LENGTH + TAG_LENGTH,
  });
  return {
    frames: frames.map((frame) => {
      const tagOffset = frame.length - SUFFIX_BYTES.length - TAG_LENGTH;
      const plaintext = decrypt(
        key,
        frame.subarray(HEADER_LENGTH, HEADER_LENGTH + IV_LENGTH),
        frame.subarray(4, HEADER_LENGTH),
        frame.subarray(HEADER_LENGTH + IV_LENGTH, tagOffset),
        frame.subarray(tagOffset, tagOffset + TAG_LENGTH),
      );
      return {
        sequenceNumber: frame.readUInt32BE(6),
        command: frame.readUInt32BE(10),
        returnCode: plaintext.readUInt32BE(0),
        payload: plaintext.subarray(RETURN_CODE_LENGTH),
      };
    }),
    remainder,
  };
}

function decrypt(
  key: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): Buffer {
  const decipher = createDecipheriv("aes-128-gcm", key, iv);
  decipher.setAAD(additionalData);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new TuyaError(
      "DECRYPTION_FAILED",
      "A frame's tag is wrong: check the local key, the session key and the protocol version",
      { cause: error },
    );
  }
}
