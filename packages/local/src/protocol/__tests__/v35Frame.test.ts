import { describe, expect, it } from "vitest";
import { decodeV35Frames, encodeV35Frame } from "../v35Frame.js";
import {
  BROADCAST_KEY,
  V35_BROADCAST,
  V35_BROADCAST_PLAINTEXT,
} from "./fixtures/capturedFrames.js";

const BROADCAST_IV = V35_BROADCAST.subarray(18, 30);

describe("decodeV35Frames", () => {
  it("decrypts a frame a device sent and reads its return code", () => {
    const { frames, remainder } = decodeV35Frames(V35_BROADCAST, BROADCAST_KEY);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      sequenceNumber: 0,
      command: 0x13,
      returnCode: 0,
    });
    expect(frames[0]?.payload.toString()).toBe(V35_BROADCAST_PLAINTEXT);
    expect(remainder).toHaveLength(0);
  });

  it("returns a frame not yet whole as the remainder", () => {
    const head = V35_BROADCAST.subarray(0, 100);

    expect(decodeV35Frames(head, BROADCAST_KEY)).toEqual({
      frames: [],
      remainder: head,
    });
  });

  it("throws a TuyaError with code DECRYPTION_FAILED for a wrong tag", () => {
    const frame = Buffer.from(V35_BROADCAST);
    frame.writeUInt32BE(0xdeadbeef, frame.length - 8);

    expect(() => decodeV35Frames(frame, BROADCAST_KEY)).toThrow(
      expect.objectContaining({
        name: "TuyaError",
        code: "DECRYPTION_FAILED",
        cause: expect.any(Error),
      }),
    );
  });

  it("throws a TuyaError with code MALFORMED_FRAME for a length field under 32", () => {
    const frame = Buffer.from(V35_BROADCAST);
    frame.writeUInt32BE(31, 14);

    expect(() => decodeV35Frames(frame, BROADCAST_KEY)).toThrow(
      expect.objectContaining({ code: "MALFORMED_FRAME" }),
    );
  });
});

describe("encodeV35Frame", () => {
  it("writes the header, the ciphertext and the tag a device writes", () => {
    const encoded = encodeV35Frame(
      {
        sequenceNumber: 0,
        command: 0x13,
        payload: Buffer.concat([
          Buffer.alloc(4),
          Buffer.from(V35_BROADCAST_PLAINTEXT),
        ]),
      },
      BROADCAST_KEY,
      BROADCAST_IV,
    );

    expect(encoded).toEqual(V35_BROADCAST);
  });

  it("throws a RangeError for an IV that is not 12 bytes", () => {
    expect(() =>
      encodeV35Frame(
        { sequenceNumber: 0, command: 0x13, payload: Buffer.alloc(0) },
        BROADCAST_KEY,
        Buffer.alloc(16),
      ),
    ).toThrow(RangeError);
  });
});
