import { describe, expect, it } from "vitest";
import {
  BROADCAST_KEY,
  V33_BROADCAST,
  V33_BROADCAST_PLAINTEXT,
  V35_BROADCAST,
  V35_BROADCAST_PLAINTEXT,
} from "../../../../local/src/protocol/__tests__/fixtures/capturedFrames.js";
import {
  CONTROL_PLAINTEXT,
  LOCAL_KEY,
  LOCAL_NONCE,
  SESSION_KEY_RESPONSE,
  STATUS_PLAINTEXT,
  V33_CONTROL,
  V33_STATUS,
  V34_CONTROL_NEW,
  V34_CONTROL_NEW_PLAINTEXT,
  V34_HEART_BEAT,
  V34_SESSION_KEY,
  V34_SESSION_KEY_RESPONSE,
  V34_SESSION_KEY_START,
  V34_STATUS,
  V35_HEART_BEAT,
  V35_IV,
  V35_SESSION_KEY,
  V35_SESSION_KEY_RESPONSE,
  V35_SESSION_KEY_START,
  V35_STATUS,
} from "../../../../local/src/protocol/__tests__/fixtures/computedFrames.js";
import { openClientFrame, sealDeviceFrame } from "../frames.js";

const NO_IV = Buffer.alloc(0);

describe("sealDeviceFrame", () => {
  it.each([
    [
      "a captured 3.3 broadcast",
      "3.3",
      { sequenceNumber: 0, command: 0x13, plaintext: V33_BROADCAST_PLAINTEXT },
      BROADCAST_KEY,
      NO_IV,
      false,
      V33_BROADCAST,
    ],
    [
      "a captured 3.5 broadcast",
      "3.5",
      { sequenceNumber: 0, command: 0x13, plaintext: V35_BROADCAST_PLAINTEXT },
      BROADCAST_KEY,
      V35_BROADCAST.subarray(18, 30),
      false,
      V35_BROADCAST,
    ],
    [
      "a 3.3 STATUS",
      "3.3",
      { sequenceNumber: 0, command: 0x08, plaintext: STATUS_PLAINTEXT },
      LOCAL_KEY,
      NO_IV,
      true,
      V33_STATUS,
    ],
    [
      "a 3.4 STATUS",
      "3.4",
      { sequenceNumber: 7, command: 0x08, plaintext: STATUS_PLAINTEXT },
      LOCAL_KEY,
      NO_IV,
      true,
      V34_STATUS,
    ],
    [
      "a 3.5 STATUS",
      "3.5",
      { sequenceNumber: 0xed66, command: 0x08, plaintext: STATUS_PLAINTEXT },
      V35_SESSION_KEY,
      V35_IV,
      true,
      V35_STATUS,
    ],
    [
      "a 3.4 SESS_KEY_NEG_RESP",
      "3.4",
      {
        sequenceNumber: 0x9f70,
        command: 0x04,
        plaintext: SESSION_KEY_RESPONSE,
      },
      LOCAL_KEY,
      NO_IV,
      false,
      V34_SESSION_KEY_RESPONSE,
    ],
    [
      "a 3.5 SESS_KEY_NEG_RESP",
      "3.5",
      {
        sequenceNumber: 0xed65,
        command: 0x04,
        plaintext: SESSION_KEY_RESPONSE,
      },
      LOCAL_KEY,
      V35_IV,
      false,
      V35_SESSION_KEY_RESPONSE,
    ],
  ] as const)(
    "writes %s byte for byte",
    (_name, version, frame, key, iv, versionHeader, expected) => {
      expect(
        sealDeviceFrame(
          version,
          {
            ...frame,
            plaintext: Buffer.from(frame.plaintext),
            returnCode: 0,
            versionHeader,
          },
          key,
          iv,
        ),
      ).toEqual(expected);
    },
  );
});

describe("openClientFrame", () => {
  it.each([
    ["3.3", V33_CONTROL, LOCAL_KEY, 2, 0x07, Buffer.from(CONTROL_PLAINTEXT)],
    ["3.4", V34_SESSION_KEY_START, LOCAL_KEY, 1, 0x03, LOCAL_NONCE],
    [
      "3.4",
      V34_CONTROL_NEW,
      LOCAL_KEY,
      3,
      0x0d,
      Buffer.from(V34_CONTROL_NEW_PLAINTEXT),
    ],
    ["3.4", V34_HEART_BEAT, V34_SESSION_KEY, 3, 0x09, Buffer.alloc(0)],
    ["3.5", V35_SESSION_KEY_START, LOCAL_KEY, 1, 0x03, LOCAL_NONCE],
    ["3.5", V35_HEART_BEAT, V35_SESSION_KEY, 3, 0x09, Buffer.alloc(0)],
  ] as const)(
    "reads a %s client frame with command %#x",
    (version, bytes, key, sequenceNumber, command, payload) => {
      expect(openClientFrame(version, bytes, key)).toEqual({
        frame: { sequenceNumber, command, payload },
        rest: Buffer.alloc(0),
      });
    },
  );

  it("returns undefined for a frame not yet whole", () => {
    expect(
      openClientFrame("3.4", V34_HEART_BEAT.subarray(0, 30), V34_SESSION_KEY),
    ).toBeUndefined();
  });

  it("returns the bytes after the frame as the rest", () => {
    expect(
      openClientFrame(
        "3.4",
        Buffer.concat([V34_HEART_BEAT, V34_HEART_BEAT]),
        V34_SESSION_KEY,
      )?.rest,
    ).toEqual(V34_HEART_BEAT);
  });

  it("throws on a frame whose HMAC is wrong", () => {
    expect(() => openClientFrame("3.4", V34_HEART_BEAT, LOCAL_KEY)).toThrow();
  });
});
