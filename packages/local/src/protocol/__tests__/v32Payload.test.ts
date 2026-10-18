import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { decodeFrames } from "../frame.js";
import { decryptV32Payload, encryptV32Payload } from "../v32Payload.js";
import {
  V32_KEY,
  V32_NULL_READ,
  V32_NULL_READ_PLAINTEXT,
  V32_QUERY_ERROR,
  V32_STATUS,
  V32_STATUS_PLAINTEXT,
} from "./fixtures/capturedFrames.js";

function devicePayload(frame: Buffer): Uint8Array {
  const [decoded] = decodeFrames(frame).frames;
  if (!decoded) {
    throw new Error("The captured bytes hold no frame");
  }
  return decoded.payload;
}

describe("encryptV32Payload", () => {
  it("seals a CONTROL_NEW as the client captured sealed it", () => {
    expect(
      encryptV32Payload(
        COMMANDS.CONTROL_NEW,
        Buffer.from(V32_NULL_READ_PLAINTEXT),
        V32_KEY,
      ),
    ).toEqual(V32_NULL_READ.subarray(16, -8));
  });

  it.each([COMMANDS.DP_QUERY, COMMANDS.HEART_BEAT])(
    "sends command %i as it is",
    (command) => {
      expect(encryptV32Payload(command, Buffer.from("{}"), V32_KEY)).toEqual(
        Buffer.from("{}"),
      );
    },
  );
});

describe("decryptV32Payload", () => {
  it("opens a STATUS a device sealed, without its version header", () => {
    expect(
      decryptV32Payload(devicePayload(V32_STATUS), V32_KEY).toString(),
    ).toBe(V32_STATUS_PLAINTEXT);
  });

  it("returns an error in plain text as it is", () => {
    expect(
      decryptV32Payload(devicePayload(V32_QUERY_ERROR), V32_KEY).toString(),
    ).toBe("data format error");
  });

  it("returns an empty payload empty", () => {
    expect(decryptV32Payload(Buffer.alloc(0), V32_KEY)).toHaveLength(0);
  });

  it("throws a TuyaError with code DECRYPTION_FAILED under the wrong key", () => {
    expect(() =>
      decryptV32Payload(
        devicePayload(V32_STATUS),
        Buffer.from("0123456789abcdef"),
      ),
    ).toThrow(expect.objectContaining({ code: "DECRYPTION_FAILED" }));
  });
});
