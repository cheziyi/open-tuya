import { describe, expect, it } from "vitest";
import {
  LOCAL_KEY,
  LOCAL_NONCE,
  REMOTE_NONCE,
  SESSION_KEY_FINISH,
  SESSION_KEY_RESPONSE,
  V34_SESSION_KEY,
  V35_SESSION_KEY,
} from "../../../../local/src/protocol/__tests__/fixtures/computedFrames.js";
import {
  buildSessionKeyResponse,
  deriveSessionKey,
  isSessionKeyFinish,
} from "../sessionKey.js";

describe("buildSessionKeyResponse", () => {
  it("puts the device's nonce ahead of the HMAC of the client's", () => {
    expect(
      buildSessionKeyResponse(REMOTE_NONCE, LOCAL_NONCE, LOCAL_KEY),
    ).toEqual(SESSION_KEY_RESPONSE);
  });
});

describe("isSessionKeyFinish", () => {
  it("accepts the HMAC of the device's nonce", () => {
    expect(
      isSessionKeyFinish(SESSION_KEY_FINISH, REMOTE_NONCE, LOCAL_KEY),
    ).toBe(true);
  });

  it("rejects any other bytes", () => {
    expect(isSessionKeyFinish(LOCAL_NONCE, REMOTE_NONCE, LOCAL_KEY)).toBe(
      false,
    );
  });
});

describe("deriveSessionKey", () => {
  it.each([
    ["3.4", V34_SESSION_KEY],
    ["3.5", V35_SESSION_KEY],
  ] as const)("derives the %s session key", (version, expected) => {
    expect(
      deriveSessionKey(version, LOCAL_NONCE, REMOTE_NONCE, LOCAL_KEY),
    ).toEqual(expected);
  });
});
