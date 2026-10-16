import { crc32 } from "node:zlib";
import { TuyaError } from "@open-tuya/core";

const PREFIX = 0x000055aa;
const PREFIX_BYTES = Buffer.from("000055aa", "hex");
const SUFFIX = 0x0000aa55;
const HEADER_LENGTH = 16;
const RETURN_CODE_LENGTH = 4;
const TRAILER_LENGTH = 8;
// Source: The cap on the length field, which fails a stream out of step
// rather than waiting on it, is from
// https://github.com/jasonacox/tinytuya/commit/0f38679d7972e446a3db854aa5eb50d8104ddd9d.
const MAX_LENGTH = 1440;

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

// Source: The length field counts the payload, the CRC and the suffix, and
// the CRC32 covers every byte before it, in
// https://github.com/codetheweb/tuyapi/commit/9ea40d76dbc8721a174b427edf738d8f2f338c60
// and https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/466664ff8845b76c7ed227682f6665e2a6cf8e36.
/** Frames a payload as a client sends it, with no return code. */
export function encodeFrame(frame: TuyaFrame): Buffer {
  const bytes = Buffer.alloc(
    HEADER_LENGTH + frame.payload.length + TRAILER_LENGTH,
  );
  bytes.writeUInt32BE(PREFIX, 0);
  bytes.writeUInt32BE(frame.sequenceNumber, 4);
  bytes.writeUInt32BE(frame.command, 8);
  bytes.writeUInt32BE(frame.payload.length + TRAILER_LENGTH, 12);
  bytes.set(frame.payload, HEADER_LENGTH);
  const crcOffset = bytes.length - TRAILER_LENGTH;
  bytes.writeUInt32BE(crc32(bytes.subarray(0, crcOffset)), crcOffset);
  bytes.writeUInt32BE(SUFFIX, crcOffset + 4);
  return bytes;
}

// Source: Every frame a device sends carries a return code in
// https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a
// and https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674.
// Source: A frame ends where its length field says in
// https://github.com/xZetsubou/hass-localtuya/commit/6d07160c4f3bc1addd19d44f49aed1c40635e7be.
// Source: Bytes before a prefix are skipped, keeping the last three in case a
// prefix starts there, in
// https://github.com/jasonacox/tinytuya/commit/54bf5459a1c5f059dd91ac2cf65a1c7c28bbd46c.
// Source: A length field too small for a return code, a CRC and a suffix is
// rejected in
// https://github.com/jasonacox/tinytuya/commit/27aa6986ed527f817a433933e00582a0ac0c66f4.
/** Splits the bytes read from a device into whole frames. It checks neither a
 * frame's CRC nor its suffix: see DESIGN.md#protocol-33. A payload and the
 * remainder are views of `bytes`, not copies. It throws a `TuyaError` with
 * code `MALFORMED_FRAME` for a length field under 12 or over 1440. */
export function decodeFrames(bytes: Uint8Array): DecodedFrames {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames: ReceivedTuyaFrame[] = [];
  let offset = 0;
  for (;;) {
    const start = buffer.indexOf(PREFIX_BYTES, offset);
    if (start === -1) {
      const kept = Math.max(offset, buffer.length - PREFIX_BYTES.length + 1);
      return { frames, remainder: buffer.subarray(kept) };
    }
    if (buffer.length - start < HEADER_LENGTH) {
      return { frames, remainder: buffer.subarray(start) };
    }
    const length = buffer.readUInt32BE(start + 12);
    if (length < RETURN_CODE_LENGTH + TRAILER_LENGTH || length > MAX_LENGTH) {
      throw new TuyaError(
        "MALFORMED_FRAME",
        `A frame's length field is ${length}, outside 12 to ${MAX_LENGTH}`,
      );
    }
    const end = start + HEADER_LENGTH + length;
    if (buffer.length < end) {
      return { frames, remainder: buffer.subarray(start) };
    }
    frames.push({
      sequenceNumber: buffer.readUInt32BE(start + 4),
      command: buffer.readUInt32BE(start + 8),
      returnCode: buffer.readUInt32BE(start + HEADER_LENGTH),
      payload: buffer.subarray(
        start + HEADER_LENGTH + RETURN_CODE_LENGTH,
        end - TRAILER_LENGTH,
      ),
    });
    offset = end;
  }
}
