import { describe, expect, it } from "vitest";
import { deriveRequestKeys } from "../request.js";
import { parseResponse } from "../response.js";
import {
  COMMAND_NOT_SUPPORTED,
  SIGN_INVALID,
  URI_PATH_INVALID,
} from "./fixtures/capturedResponses.js";
import { GET_REQUEST, REFRESH_TOKEN } from "./fixtures/computedRequests.js";

describe("parseResponse", () => {
  it("reads a captured error's code and message", () => {
    expect(parseResponse(SIGN_INVALID)).toEqual({
      success: false,
      code: "-9999999",
      message: "sign invalid",
    });
    expect(parseResponse(COMMAND_NOT_SUPPORTED)).toEqual({
      success: false,
      code: "2008",
      message: "command or value not support",
    });
  });

  it("reads a code sent as a number as a string", () => {
    expect(parseResponse(URI_PATH_INVALID)).toMatchObject({ code: "1108" });
  });

  it("decrypts the result and parses its JSON", () => {
    const { encryptionKey } = deriveRequestKeys(
      GET_REQUEST.requestId,
      REFRESH_TOKEN,
    );

    expect(
      parseResponse(
        { success: true, t: 1, result: GET_REQUEST.responseResult },
        encryptionKey,
      ),
    ).toEqual({
      success: true,
      result: JSON.parse(GET_REQUEST.decryptedResult),
    });
  });

  it("leaves an empty result as it is", () => {
    const { encryptionKey } = deriveRequestKeys(
      GET_REQUEST.requestId,
      REFRESH_TOKEN,
    );

    expect(
      parseResponse({ success: true, t: 1, result: "" }, encryptionKey),
    ).toEqual({ success: true, result: "" });
  });

  it("reads an unencrypted result without a key", () => {
    expect(
      parseResponse({ success: true, t: 1, result: { qrcode: "token" } }),
    ).toEqual({ success: true, result: { qrcode: "token" } });
  });
});
