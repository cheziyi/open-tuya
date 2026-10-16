import { describe, expect, it } from "vitest";
import {
  buildSessionKeyFinish,
  deriveV34SessionKey,
  deriveV35SessionKey,
  parseSessionKeyResponse,
} from "../sessionKey.js";
import {
  LOCAL_KEY,
  LOCAL_NONCE,
  REMOTE_NONCE,
  SESSION_KEY_FINISH,
  SESSION_KEY_RESPONSE,
  V34_SESSION_KEY,
  V35_SESSION_KEY,
} from "./fixtures/computedFrames.js";

describe("parseSessionKeyResponse", () => {
  it("returns the device's nonce", () => {
    expect(
      parseSessionKeyResponse(SESSION_KEY_RESPONSE, LOCAL_NONCE, LOCAL_KEY),
    ).toEqual(REMOTE_NONCE);
  });

  it("throws a TuyaError with code SESSION_KEY_NEGOTIATION_FAILED for a wrong HMAC", () => {
    expect(() =>
      parseSessionKeyResponse(
        SESSION_KEY_RESPONSE,
        LOCAL_NONCE,
        Buffer.from("fedcba9876543210"),
      ),
    ).toThrow(
      expect.objectContaining({
        name: "TuyaError",
        code: "SESSION_KEY_NEGOTIATION_FAILED",
      }),
    );
  });

  it("throws a TuyaError with code SESSION_KEY_NEGOTIATION_FAILED for a reply under 48 bytes", () => {
    expect(() =>
      parseSessionKeyResponse(
        SESSION_KEY_RESPONSE.subarray(0, 47),
        LOCAL_NONCE,
        LOCAL_KEY,
      ),
    ).toThrow(
      expect.objectContaining({ code: "SESSION_KEY_NEGOTIATION_FAILED" }),
    );
  });
});

describe("buildSessionKeyFinish", () => {
  it("signs the device's nonce", () => {
    expect(buildSessionKeyFinish(REMOTE_NONCE, LOCAL_KEY)).toEqual(
      SESSION_KEY_FINISH,
    );
  });
});

describe("deriveV34SessionKey", () => {
  it("derives the session key from the two nonces", () => {
    expect(deriveV34SessionKey(LOCAL_NONCE, REMOTE_NONCE, LOCAL_KEY)).toEqual(
      V34_SESSION_KEY,
    );
  });

  it("throws a RangeError for a nonce that is not 16 bytes", () => {
    expect(() =>
      deriveV34SessionKey(LOCAL_NONCE.subarray(0, 15), REMOTE_NONCE, LOCAL_KEY),
    ).toThrow(RangeError);
  });
});

describe("deriveV35SessionKey", () => {
  it("derives the session key from the two nonces", () => {
    expect(deriveV35SessionKey(LOCAL_NONCE, REMOTE_NONCE, LOCAL_KEY)).toEqual(
      V35_SESSION_KEY,
    );
  });
});
