import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { decryptV34Payload, encryptV34Payload } from "../v34Payload.js";
import {
  LOCAL_KEY,
  LOCAL_NONCE,
  V34_CONTROL_NEW,
  V34_CONTROL_NEW_PLAINTEXT,
  V34_SESSION_KEY_START,
  V34_STATUS,
  V34_STATUS_PLAINTEXT,
} from "./fixtures/computedFrames.js";

describe("encryptV34Payload", () => {
  it("encrypts the header with the payload", () => {
    expect(
      encryptV34Payload(
        COMMANDS.CONTROL_NEW,
        Buffer.from(V34_CONTROL_NEW_PLAINTEXT),
        LOCAL_KEY,
      ),
    ).toEqual(V34_CONTROL_NEW.subarray(16, -36));
  });

  it("encrypts a nonce without the header, padded by a full block", () => {
    expect(
      encryptV34Payload(COMMANDS.SESS_KEY_NEG_START, LOCAL_NONCE, LOCAL_KEY),
    ).toEqual(V34_SESSION_KEY_START.subarray(16, -36));
  });
});

describe("decryptV34Payload", () => {
  it("decrypts a payload a device sent and drops its header", () => {
    expect(
      decryptV34Payload(V34_STATUS.subarray(20, -36), LOCAL_KEY).toString(),
    ).toBe(V34_STATUS_PLAINTEXT);
  });

  it("returns an empty payload empty", () => {
    expect(decryptV34Payload(Buffer.alloc(0), LOCAL_KEY)).toHaveLength(0);
  });

  it("throws a TuyaError with code DECRYPTION_FAILED under the wrong key", () => {
    expect(() =>
      decryptV34Payload(
        V34_STATUS.subarray(20, -36),
        Buffer.from("fedcba9876543210"),
      ),
    ).toThrow(
      expect.objectContaining({ name: "TuyaError", code: "DECRYPTION_FAILED" }),
    );
  });
});
