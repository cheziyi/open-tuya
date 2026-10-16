import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { encodeFrame } from "../frame.js";
import { decodeMessages, encodeMessage } from "../message.js";
import {
  CONTROL_PLAINTEXT,
  LOCAL_KEY,
  LOCAL_NONCE,
  SESSION_KEY_RESPONSE,
  STATUS_PLAINTEXT,
  V33_CONTROL,
  V33_STATUS,
  V34_HEART_BEAT,
  V34_SESSION_KEY,
  V34_SESSION_KEY_RESPONSE,
  V35_HEART_BEAT,
  V35_IV,
  V35_SESSION_KEY,
  V35_SESSION_KEY_RESPONSE,
  V35_SESSION_KEY_START,
  V35_STATUS,
} from "./fixtures/computedFrames.js";

describe("encodeMessage", () => {
  it.each([
    [
      "3.3",
      "CONTROL",
      2,
      COMMANDS.CONTROL,
      Buffer.from(CONTROL_PLAINTEXT),
      LOCAL_KEY,
      V33_CONTROL,
    ],
    [
      "3.4",
      "HEART_BEAT",
      3,
      COMMANDS.HEART_BEAT,
      Buffer.alloc(0),
      V34_SESSION_KEY,
      V34_HEART_BEAT,
    ],
    [
      "3.5",
      "SESS_KEY_NEG_START",
      1,
      COMMANDS.SESS_KEY_NEG_START,
      LOCAL_NONCE,
      LOCAL_KEY,
      V35_SESSION_KEY_START,
    ],
    [
      "3.5",
      "HEART_BEAT",
      3,
      COMMANDS.HEART_BEAT,
      Buffer.alloc(0),
      V35_SESSION_KEY,
      V35_HEART_BEAT,
    ],
  ] as const)(
    "writes a %s %s frame byte for byte",
    (version, _name, sequenceNumber, command, payload, key, expected) => {
      expect(
        encodeMessage(
          version,
          { sequenceNumber, command, payload },
          key,
          V35_IV,
        ),
      ).toEqual(expected);
    },
  );
});

describe("decodeMessages", () => {
  it.each([
    [
      "3.3",
      "STATUS",
      V33_STATUS,
      LOCAL_KEY,
      0,
      0x08,
      Buffer.from(STATUS_PLAINTEXT),
    ],
    [
      "3.4",
      "SESS_KEY_NEG_RESP",
      V34_SESSION_KEY_RESPONSE,
      LOCAL_KEY,
      0x9f70,
      0x04,
      SESSION_KEY_RESPONSE,
    ],
    [
      "3.5",
      "SESS_KEY_NEG_RESP",
      V35_SESSION_KEY_RESPONSE,
      LOCAL_KEY,
      0xed65,
      0x04,
      SESSION_KEY_RESPONSE,
    ],
    [
      "3.5",
      "STATUS",
      V35_STATUS,
      V35_SESSION_KEY,
      0xed66,
      0x08,
      Buffer.from(STATUS_PLAINTEXT),
    ],
  ] as const)(
    "reads a %s %s frame, decrypted and without its version header",
    (version, _name, bytes, key, sequenceNumber, command, payload) => {
      expect(decodeMessages(version, bytes, key)).toEqual({
        frames: [{ sequenceNumber, command, returnCode: 0, payload }],
        errors: [],
        remainder: Buffer.alloc(0),
      });
    },
  );

  it("leaves out a frame whose payload does not decrypt, and reads the frame after it", () => {
    const fiveBytesAfterTheReturnCode = encodeFrame({
      sequenceNumber: 0,
      command: COMMANDS.CONTROL,
      payload: Buffer.alloc(4 + 5),
    });

    const { frames, errors } = decodeMessages(
      "3.3",
      Buffer.concat([fiveBytesAfterTheReturnCode, V33_STATUS]),
      LOCAL_KEY,
    );

    expect(frames).toHaveLength(1);
    expect(errors).toEqual([
      expect.objectContaining({ code: "DECRYPTION_FAILED" }),
    ]);
  });
});
