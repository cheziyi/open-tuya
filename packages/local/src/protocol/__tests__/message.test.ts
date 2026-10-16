import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { encodeFrame } from "../frame.js";
import { decodeMessages, encodeMessage } from "../message.js";
import {
  V33_QUERY_ERROR,
  V33_QUERY_ERROR_KEY,
  V33_QUERY_ERROR_PLAINTEXT,
  V35_QUERY,
  V35_QUERY_ERROR,
  V35_QUERY_ERROR_PLAINTEXT,
  V35_QUERY_IV,
  V35_QUERY_SESSION_KEY,
} from "./fixtures/capturedFrames.js";
import {
  CONTROL_PLAINTEXT,
  LOCAL_KEY,
  LOCAL_NONCE,
  SESSION_KEY_RESPONSE,
  STATUS_PLAINTEXT,
  V33_CONTROL,
  V33_STATUS,
  V34_EMPTY_HEART_BEAT,
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
      V34_EMPTY_HEART_BEAT,
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

  it.each([
    [
      "3.3",
      V33_QUERY_ERROR,
      V33_QUERY_ERROR_KEY,
      1,
      COMMANDS.DP_QUERY,
      V33_QUERY_ERROR_PLAINTEXT,
    ],
    [
      "3.5",
      V35_QUERY_ERROR,
      V35_QUERY_SESSION_KEY,
      0xf216,
      COMMANDS.DP_QUERY_NEW,
      V35_QUERY_ERROR_PLAINTEXT,
    ],
  ] as const)(
    "reads the error a %s device sent, with return code 1",
    (version, bytes, key, sequenceNumber, command, text) => {
      expect(decodeMessages(version, bytes, key)).toEqual({
        frames: [
          {
            sequenceNumber,
            command,
            returnCode: 1,
            payload: Buffer.from(text),
          },
        ],
        errors: [],
        remainder: Buffer.alloc(0),
      });
    },
  );
});

describe("encodeMessage, against a captured frame", () => {
  it("writes the DP_QUERY_NEW a client sent a 3.5 device byte for byte", () => {
    expect(
      encodeMessage(
        "3.5",
        {
          sequenceNumber: 3,
          command: COMMANDS.DP_QUERY_NEW,
          payload: Buffer.from("{}"),
        },
        V35_QUERY_SESSION_KEY,
        V35_QUERY_IV,
      ),
    ).toEqual(V35_QUERY);
  });
});
