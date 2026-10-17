import { describe, expect, it } from "vitest";
import { decryptPushData } from "../message.js";
import {
  PUSH_DATA,
  PUSH_PASSWORD,
  PUSH_PLAINTEXT,
  PUSH_T,
} from "./fixtures/computedMessages.js";

describe("decryptPushData", () => {
  it("decrypts what the SDK decrypts", () => {
    expect(decryptPushData(PUSH_DATA, PUSH_PASSWORD, PUSH_T)).toBe(
      PUSH_PLAINTEXT,
    );
  });

  it("throws DECRYPTION_FAILED under another t, as the tag covers it", () => {
    expect(() => decryptPushData(PUSH_DATA, PUSH_PASSWORD, PUSH_T + 1)).toThrow(
      expect.objectContaining({ code: "DECRYPTION_FAILED" }),
    );
  });

  it("keys on the 9th to 24th characters of the password alone", () => {
    expect(
      decryptPushData(PUSH_DATA, "XXXXXXXX89abcdefFEDCBA98XXXXXXXX", PUSH_T),
    ).toBe(PUSH_PLAINTEXT);
  });

  it("throws DECRYPTION_FAILED under another key", () => {
    expect(() =>
      decryptPushData(PUSH_DATA, "01234567XXXXXXXXXXXXXXXX76543210", PUSH_T),
    ).toThrow(expect.objectContaining({ code: "DECRYPTION_FAILED" }));
  });

  it("throws DECRYPTION_FAILED for bytes shorter than their IV and tag", () => {
    expect(() => decryptPushData("AAAADDAx", PUSH_PASSWORD, PUSH_T)).toThrow(
      expect.objectContaining({ code: "DECRYPTION_FAILED" }),
    );
  });
});
