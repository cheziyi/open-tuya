import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import { decodeFrames } from "../frame.js";
import { decryptV33Payload, encryptV33Payload } from "../v33Payload.js";
import {
  BROADCAST_KEY,
  TUYAPI_CIPHERTEXT,
  TUYAPI_KEY,
  TUYAPI_PLAINTEXT,
  V33_BROADCAST,
  V33_BROADCAST_PLAINTEXT,
} from "./fixtures/capturedFrames.js";

const V33_HEADER = Buffer.concat([Buffer.from("3.3"), Buffer.alloc(12)]);
const PLAINTEXT = Buffer.from(TUYAPI_PLAINTEXT);

describe("encryptV33Payload", () => {
  it.each([
    COMMANDS.HEART_BEAT,
    COMMANDS.DP_QUERY,
    COMMANDS.DP_QUERY_NEW,
    COMMANDS.UPDATEDPS,
  ])("sends command %i as the ciphertext alone", (command) => {
    expect(encryptV33Payload(command, PLAINTEXT, TUYAPI_KEY)).toEqual(
      TUYAPI_CIPHERTEXT,
    );
  });

  it("puts the header in front of the ciphertext of any other command", () => {
    expect(encryptV33Payload(COMMANDS.CONTROL, PLAINTEXT, TUYAPI_KEY)).toEqual(
      Buffer.concat([V33_HEADER, TUYAPI_CIPHERTEXT]),
    );
  });
});

describe("decryptV33Payload", () => {
  it("decrypts a payload a device sent", () => {
    const [frame] = decodeFrames(V33_BROADCAST).frames;
    if (frame === undefined) {
      throw new Error("The captured broadcast holds no frame");
    }

    expect(decryptV33Payload(frame.payload, BROADCAST_KEY).toString()).toBe(
      V33_BROADCAST_PLAINTEXT,
    );
  });

  it("decrypts a payload without the header", () => {
    expect(decryptV33Payload(TUYAPI_CIPHERTEXT, TUYAPI_KEY)).toEqual(PLAINTEXT);
  });

  it("drops the header before decrypting", () => {
    expect(
      decryptV33Payload(
        Buffer.concat([V33_HEADER, TUYAPI_CIPHERTEXT]),
        TUYAPI_KEY,
      ),
    ).toEqual(PLAINTEXT);
  });

  it("drops a header whose 12 bytes after 3.3 are not zero", () => {
    const sourceHeader = Buffer.concat([
      Buffer.from("3.3"),
      Buffer.from("0000000000000007" + "00000001", "hex"),
    ]);

    expect(
      decryptV33Payload(
        Buffer.concat([sourceHeader, TUYAPI_CIPHERTEXT]),
        TUYAPI_KEY,
      ),
    ).toEqual(PLAINTEXT);
  });

  it("returns an empty payload empty", () => {
    expect(decryptV33Payload(Buffer.alloc(0), TUYAPI_KEY)).toHaveLength(0);
  });

  it("throws a TuyaError with code DECRYPTION_FAILED under the wrong key", () => {
    expect(() =>
      decryptV33Payload(TUYAPI_CIPHERTEXT, Buffer.from("0123456789abcdef")),
    ).toThrow(
      expect.objectContaining({
        name: "TuyaError",
        code: "DECRYPTION_FAILED",
        cause: expect.any(Error),
      }),
    );
  });
});
