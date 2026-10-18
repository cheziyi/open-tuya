import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { decodeFrames } from "../frame.js";
import { decryptV31Payload, encryptV31Payload } from "../v31Payload.js";
import {
  TUYAPI_KEY,
  TUYAPI_PLAINTEXT,
  TUYAPI_V31_PAYLOAD,
  V31_CONTROL,
  V31_CONTROL_PLAINTEXT,
  V31_KEY,
  V31_QUERY_REPLY,
  V31_QUERY_REPLY_PLAINTEXT,
  V31_STATUS,
  V31_STATUS_PLAINTEXT,
} from "./fixtures/capturedFrames.js";

// A client's frame carries no return code: its payload runs from byte 16 to
// the CRC.
function clientPayload(frame: Buffer): Buffer {
  return frame.subarray(16, -8);
}

function devicePayload(frame: Buffer): Uint8Array {
  const [decoded] = decodeFrames(frame).frames;
  if (!decoded) {
    throw new Error("The captured bytes hold no frame");
  }
  return decoded.payload;
}

describe("encryptV31Payload", () => {
  it("seals a CONTROL as the client captured sealed it", () => {
    expect(
      encryptV31Payload(
        COMMANDS.CONTROL,
        Buffer.from(V31_CONTROL_PLAINTEXT),
        V31_KEY,
      ),
    ).toEqual(clientPayload(V31_CONTROL));
  });

  it.each([COMMANDS.DP_QUERY, COMMANDS.HEART_BEAT])(
    "sends command %i as it is",
    (command) => {
      expect(encryptV31Payload(command, Buffer.from("{}"), V31_KEY)).toEqual(
        Buffer.from("{}"),
      );
    },
  );
});

describe("decryptV31Payload", () => {
  it("opens a STATUS a device sealed", () => {
    expect(
      decryptV31Payload(devicePayload(V31_STATUS), V31_KEY).toString(),
    ).toBe(V31_STATUS_PLAINTEXT);
  });

  it("opens tuyapi's sealed payload", () => {
    expect(decryptV31Payload(TUYAPI_V31_PAYLOAD, TUYAPI_KEY).toString()).toBe(
      TUYAPI_PLAINTEXT,
    );
  });

  it("returns a reply in plain text as it is", () => {
    expect(
      decryptV31Payload(devicePayload(V31_QUERY_REPLY), V31_KEY).toString(),
    ).toBe(V31_QUERY_REPLY_PLAINTEXT);
  });

  it("returns an empty payload empty", () => {
    expect(decryptV31Payload(Buffer.alloc(0), V31_KEY)).toHaveLength(0);
  });

  it("throws a TuyaError with code DECRYPTION_FAILED under the wrong key", () => {
    expect(() =>
      decryptV31Payload(devicePayload(V31_STATUS), TUYAPI_KEY),
    ).toThrow(expect.objectContaining({ code: "DECRYPTION_FAILED" }));
  });

  it("throws a TuyaError with code DECRYPTION_FAILED for a signature that does not match", () => {
    const payload = Buffer.from(devicePayload(V31_STATUS));
    payload[3] = payload[3] === 0x30 ? 0x31 : 0x30;

    expect(() => decryptV31Payload(payload, V31_KEY)).toThrow(
      expect.objectContaining({ code: "DECRYPTION_FAILED" }),
    );
  });
});
