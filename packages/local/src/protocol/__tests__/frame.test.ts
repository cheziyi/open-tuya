import { describe, expect, it } from "vitest";
import { decodeFrames, encodeFrame } from "../frame.js";
import { V33_BROADCAST } from "./fixtures/capturedFrames.js";

function withLengthField(length: number): Buffer {
  const frame = Buffer.from(V33_BROADCAST);
  frame.writeUInt32BE(length, 12);
  return frame;
}

describe("decodeFrames", () => {
  it("reads a frame a device sent", () => {
    const { frames, remainder } = decodeFrames(V33_BROADCAST);

    expect(frames).toEqual([
      {
        sequenceNumber: 0,
        command: 0x13,
        returnCode: 0,
        payload: V33_BROADCAST.subarray(20, -8),
      },
    ]);
    expect(remainder).toHaveLength(0);
  });

  it("reads two frames from one read", () => {
    const { frames } = decodeFrames(
      Buffer.concat([V33_BROADCAST, V33_BROADCAST]),
    );

    expect(frames).toHaveLength(2);
  });

  it("returns a frame not yet whole as the remainder", () => {
    const head = V33_BROADCAST.subarray(0, 100);

    const first = decodeFrames(head);
    const second = decodeFrames(
      Buffer.concat([first.remainder, V33_BROADCAST.subarray(100)]),
    );

    expect(first).toEqual({ frames: [], remainder: head });
    expect(second.frames).toHaveLength(1);
  });

  it("returns a header not yet whole as the remainder", () => {
    const head = V33_BROADCAST.subarray(0, 10);

    expect(decodeFrames(head)).toEqual({ frames: [], remainder: head });
  });

  it("skips bytes before a prefix", () => {
    const { frames, remainder } = decodeFrames(
      Buffer.concat([Buffer.from("deadbeef", "hex"), V33_BROADCAST]),
    );

    expect(frames).toHaveLength(1);
    expect(remainder).toHaveLength(0);
  });

  it("keeps the last three bytes when it finds no prefix", () => {
    const { frames, remainder } = decodeFrames(
      Buffer.from("deadbeef000055", "hex"),
    );

    expect(frames).toEqual([]);
    expect(remainder).toEqual(Buffer.from("000055", "hex"));
  });

  it("keeps no bytes of a frame it has read", () => {
    const { remainder } = decodeFrames(
      Buffer.concat([V33_BROADCAST, Buffer.from("00", "hex")]),
    );

    expect(remainder).toEqual(Buffer.from("00", "hex"));
  });

  it("reads a frame whose CRC is wrong", () => {
    const frame = Buffer.from(V33_BROADCAST);
    frame.writeUInt32BE(0xdeadbeef, frame.length - 8);

    expect(decodeFrames(frame).frames).toHaveLength(1);
  });

  it.each([11, 1441])(
    "throws a TuyaError with code MALFORMED_FRAME for a length field of %i",
    (length) => {
      expect(() => decodeFrames(withLengthField(length))).toThrow(
        expect.objectContaining({ name: "TuyaError", code: "MALFORMED_FRAME" }),
      );
    },
  );
});

describe("encodeFrame", () => {
  it("writes the length field and the CRC a device writes", () => {
    const encoded = encodeFrame({
      sequenceNumber: 0,
      command: 0x13,
      payload: V33_BROADCAST.subarray(16, -8),
    });

    expect(encoded).toEqual(V33_BROADCAST);
  });

  it("writes the sequence number and the command", () => {
    const encoded = encodeFrame({
      sequenceNumber: 0x01020304,
      command: 0x07,
      payload: Buffer.alloc(0),
    });

    expect(encoded.subarray(0, 16)).toEqual(
      Buffer.from("000055aa010203040000000700000008", "hex"),
    );
    expect(encoded.subarray(-4)).toEqual(Buffer.from("0000aa55", "hex"));
  });
});
