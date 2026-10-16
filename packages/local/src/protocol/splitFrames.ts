import { TuyaError } from "@open-tuya/core";

// Source: The cap on the length field, which fails a stream out of step
// rather than waiting on it, is from
// https://github.com/jasonacox/tinytuya/commit/0f38679d7972e446a3db854aa5eb50d8104ddd9d.
const MAX_LENGTH = 1440;

export interface FrameLayout {
  prefix: Buffer;
  lengthOffset: number;
  /** The bytes of a frame that its length field does not count. */
  uncountedLength: number;
  minLength: number;
}

export interface SplitFrames {
  frames: Buffer[];
  remainder: Buffer;
}

// Source: A frame ends where its length field says in
// https://github.com/xZetsubou/hass-localtuya/commit/6d07160c4f3bc1addd19d44f49aed1c40635e7be.
// Source: Bytes before a prefix are skipped, keeping the last three in case a
// prefix starts there, in
// https://github.com/jasonacox/tinytuya/commit/54bf5459a1c5f059dd91ac2cf65a1c7c28bbd46c.
// Source: A length field too small for the frame's fixed fields is rejected in
// https://github.com/jasonacox/tinytuya/commit/27aa6986ed527f817a433933e00582a0ac0c66f4.
export function splitFrames(
  bytes: Uint8Array,
  layout: FrameLayout,
): SplitFrames {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const start = buffer.indexOf(layout.prefix, offset);
    if (start === -1) {
      const kept = Math.max(offset, buffer.length - layout.prefix.length + 1);
      return { frames, remainder: buffer.subarray(kept) };
    }
    if (buffer.length - start < layout.lengthOffset + 4) {
      return { frames, remainder: buffer.subarray(start) };
    }
    const length = buffer.readUInt32BE(start + layout.lengthOffset);
    if (length < layout.minLength || length > MAX_LENGTH) {
      throw new TuyaError(
        "MALFORMED_FRAME",
        `A frame's length field is ${length}, outside ${layout.minLength} to ${MAX_LENGTH}`,
      );
    }
    const end = start + layout.uncountedLength + length;
    if (buffer.length < end) {
      return { frames, remainder: buffer.subarray(start) };
    }
    frames.push(buffer.subarray(start, end));
    offset = end;
  }
}
