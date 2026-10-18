import { TuyaError } from "@open-tuya/core";

// A corrupt length field would leave the reader waiting for bytes that never
// come: see DESIGN.md#received-frames.
const MAX_LENGTH = 102_400;

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
  /** Set for a length field out of range: the frames before it are in
   * `frames`, and the bytes from it on are dropped. */
  malformed?: TuyaError;
}

// A frame ends where its length field says, not at its suffix: see
// DESIGN.md#received-frames. With no prefix in sight, the last three bytes are
// kept, as a prefix split across two reads starts in them.
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
      return {
        frames,
        remainder: Buffer.alloc(0),
        malformed: new TuyaError(
          "MALFORMED_FRAME",
          `A frame's length field is ${length}, outside ${layout.minLength} to ${MAX_LENGTH}`,
        ),
      };
    }
    const end = start + layout.uncountedLength + length;
    if (buffer.length < end) {
      return { frames, remainder: buffer.subarray(start) };
    }
    frames.push(buffer.subarray(start, end));
    offset = end;
  }
}
