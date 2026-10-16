import { createHmac } from "node:crypto";
import { crc32 } from "node:zlib";
import { TuyaError } from "@open-tuya/core";
import { splitFrames } from "./splitFrames.js";

const PREFIX = 0x000055aa;
const PREFIX_BYTES = Buffer.from("000055aa", "hex");
const SUFFIX = 0x0000aa55;
const HEADER_LENGTH = 16;
const RETURN_CODE_LENGTH = 4;
const CRC_LENGTH = 4;
const HMAC_LENGTH = 32;
const SUFFIX_LENGTH = 4;

export interface TuyaFrame {
  sequenceNumber: number;
  command: number;
  payload: Uint8Array;
}

/** A frame from a device. It carries a return code ahead of its payload,
 * which a frame from a client does not. */
export interface ReceivedTuyaFrame extends TuyaFrame {
  returnCode: number;
}

export interface DecodedFrames {
  frames: ReceivedTuyaFrame[];
  /** The bytes of a frame not yet whole, to put in front of the next read. */
  remainder: Buffer;
}

type Sign = (bytes: Uint8Array) => Buffer;

// Source: The length field counts the payload, the CRC and the suffix, and
// the CRC32 covers every byte before it, in
// https://github.com/codetheweb/tuyapi/commit/9ea40d76dbc8721a174b427edf738d8f2f338c60
// and https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/466664ff8845b76c7ed227682f6665e2a6cf8e36.
/** Frames a payload for a 3.1 to 3.3 device, with a CRC32 and no return
 * code. */
export function encodeFrame(frame: TuyaFrame): Buffer {
  return encode55aaFrame(frame, CRC_LENGTH, signWithCrc32);
}

// Source: An HMAC-SHA256 takes the place of the CRC, over the same bytes, in
// https://github.com/jasonacox/tinytuya/commit/782b469ee4c38b01703410fcc8f745bb53489c0e
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
/** Frames a payload for a 3.4 device, with an HMAC-SHA256 under `key` and no
 * return code. `key` is the local key during the session key negotiation,
 * and the session key after it. */
export function encodeV34Frame(frame: TuyaFrame, key: Uint8Array): Buffer {
  return encode55aaFrame(frame, HMAC_LENGTH, signWithHmac(key));
}

// Source: Every frame a device sends carries a return code in
// https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a
// and https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674.
/** Splits the bytes read from a 3.1 to 3.3 device into whole frames. A
 * payload and the remainder are views of `bytes`, not copies. It throws a
 * `TuyaError` with code `MALFORMED_FRAME` for a length field under 12 or over
 * 1440, or a wrong CRC. It does not check the suffix: see
 * DESIGN.md#received-frames. */
export function decodeFrames(bytes: Uint8Array): DecodedFrames {
  return decode55aaFrames(
    bytes,
    CRC_LENGTH,
    signWithCrc32,
    () => new TuyaError("MALFORMED_FRAME", "A frame's CRC is wrong"),
  );
}

/** Splits the bytes read from a 3.4 device into whole frames, checking each
 * HMAC under `key`: the local key during the session key negotiation, and the
 * session key after it. A payload and the remainder are views of `bytes`,
 * not copies. It throws a `TuyaError` with code `MALFORMED_FRAME` for a
 * length field under 40 or over 1440, and `DECRYPTION_FAILED` for a wrong
 * HMAC. */
export function decodeV34Frames(
  bytes: Uint8Array,
  key: Uint8Array,
): DecodedFrames {
  return decode55aaFrames(
    bytes,
    HMAC_LENGTH,
    signWithHmac(key),
    () =>
      new TuyaError(
        "DECRYPTION_FAILED",
        "A frame's HMAC is wrong: check the local key, the session key and the protocol version",
      ),
  );
}

function encode55aaFrame(
  frame: TuyaFrame,
  signatureLength: number,
  sign: Sign,
): Buffer {
  const signatureOffset = HEADER_LENGTH + frame.payload.length;
  const bytes = Buffer.alloc(signatureOffset + signatureLength + SUFFIX_LENGTH);
  bytes.writeUInt32BE(PREFIX, 0);
  bytes.writeUInt32BE(frame.sequenceNumber, 4);
  bytes.writeUInt32BE(frame.command, 8);
  bytes.writeUInt32BE(
    frame.payload.length + signatureLength + SUFFIX_LENGTH,
    12,
  );
  bytes.set(frame.payload, HEADER_LENGTH);
  bytes.set(sign(bytes.subarray(0, signatureOffset)), signatureOffset);
  bytes.writeUInt32BE(SUFFIX, signatureOffset + signatureLength);
  return bytes;
}

function decode55aaFrames(
  bytes: Uint8Array,
  signatureLength: number,
  sign: Sign,
  signatureError: () => TuyaError,
): DecodedFrames {
  const { frames, remainder } = splitFrames(bytes, {
    prefix: PREFIX_BYTES,
    lengthOffset: 12,
    uncountedLength: HEADER_LENGTH,
    minLength: RETURN_CODE_LENGTH + signatureLength + SUFFIX_LENGTH,
  });
  return {
    frames: frames.map((frame) => {
      const signatureOffset = frame.length - SUFFIX_LENGTH - signatureLength;
      const signature = frame.subarray(
        signatureOffset,
        signatureOffset + signatureLength,
      );
      if (!sign(frame.subarray(0, signatureOffset)).equals(signature)) {
        throw signatureError();
      }
      return {
        sequenceNumber: frame.readUInt32BE(4),
        command: frame.readUInt32BE(8),
        returnCode: frame.readUInt32BE(HEADER_LENGTH),
        payload: frame.subarray(
          HEADER_LENGTH + RETURN_CODE_LENGTH,
          signatureOffset,
        ),
      };
    }),
    remainder,
  };
}

function signWithCrc32(bytes: Uint8Array): Buffer {
  const crc = Buffer.alloc(CRC_LENGTH);
  crc.writeUInt32BE(crc32(bytes));
  return crc;
}

function signWithHmac(key: Uint8Array): Sign {
  return (bytes) => createHmac("sha256", key).update(bytes).digest();
}
