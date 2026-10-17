import { describe, expect, it } from "vitest";
import {
  decryptPayload,
  deriveRequestKeys,
  encryptPayload,
  signRequest,
} from "../request.js";
import {
  ACCESS_TOKEN,
  BARE_REQUEST,
  CLIENT_ID,
  GET_REQUEST,
  POST_REQUEST,
  REFRESH_TOKEN,
  TIME_IN_MS,
} from "./fixtures/computedRequests.js";

const COMMON = {
  clientId: CLIENT_ID,
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  timeInMs: TIME_IN_MS,
};

describe("signRequest", () => {
  it("encrypts a query and signs it as the SDK does", () => {
    const signed = signRequest({
      ...COMMON,
      requestId: GET_REQUEST.requestId,
      query: {
        data: GET_REQUEST.query,
        nonce: Buffer.from(GET_REQUEST.nonce),
      },
    });

    expect(signed.query).toBe(GET_REQUEST.encdata);
    expect(signed.body).toBeUndefined();
    expect(signed.headers).toEqual({
      "X-appKey": CLIENT_ID,
      "X-requestId": GET_REQUEST.requestId,
      "X-sid": "",
      "X-time": String(TIME_IN_MS),
      "X-token": ACCESS_TOKEN,
      "X-sign": GET_REQUEST.sign,
    });
  });

  it("encrypts a body and signs it as the SDK does", () => {
    const signed = signRequest({
      ...COMMON,
      requestId: POST_REQUEST.requestId,
      body: {
        data: POST_REQUEST.body,
        nonce: Buffer.from(POST_REQUEST.nonce),
      },
    });

    expect(signed.query).toBeUndefined();
    expect(JSON.parse(signed.body ?? "")).toEqual({
      encdata: POST_REQUEST.encdata,
    });
    expect(signed.headers["X-sign"]).toBe(POST_REQUEST.sign);
  });

  it("signs the headers alone with no query or body", () => {
    const signed = signRequest({
      ...COMMON,
      requestId: BARE_REQUEST.requestId,
    });

    expect(signed.headers["X-sign"]).toBe(BARE_REQUEST.sign);
  });

  it("leaves out a part with no parameters", () => {
    const signed = signRequest({
      ...COMMON,
      requestId: BARE_REQUEST.requestId,
      query: { data: {}, nonce: Buffer.from(GET_REQUEST.nonce) },
    });

    expect(signed.query).toBeUndefined();
    expect(signed.headers["X-sign"]).toBe(BARE_REQUEST.sign);
  });
});

describe("decryptPayload", () => {
  it("decrypts a result the SDK encrypted under the request's key", () => {
    const { encryptionKey } = deriveRequestKeys(
      GET_REQUEST.requestId,
      REFRESH_TOKEN,
    );

    expect(decryptPayload(GET_REQUEST.responseResult, encryptionKey)).toBe(
      GET_REQUEST.decryptedResult,
    );
  });

  it("throws DECRYPTION_FAILED under another key", () => {
    const { encryptionKey } = deriveRequestKeys(
      POST_REQUEST.requestId,
      REFRESH_TOKEN,
    );

    expect(() =>
      decryptPayload(GET_REQUEST.responseResult, encryptionKey),
    ).toThrow(expect.objectContaining({ code: "DECRYPTION_FAILED" }));
  });

  it("throws DECRYPTION_FAILED for bytes shorter than a nonce and a tag", () => {
    const { encryptionKey } = deriveRequestKeys(
      GET_REQUEST.requestId,
      REFRESH_TOKEN,
    );

    expect(() => decryptPayload("AAAA", encryptionKey)).toThrow(
      expect.objectContaining({ code: "DECRYPTION_FAILED" }),
    );
  });

  it("reads back what encryptPayload wrote", () => {
    const { encryptionKey } = deriveRequestKeys(
      GET_REQUEST.requestId,
      REFRESH_TOKEN,
    );
    const encrypted = encryptPayload(
      '{"a":"é"}',
      encryptionKey,
      Buffer.from(GET_REQUEST.nonce),
    );

    expect(decryptPayload(encrypted, encryptionKey)).toBe('{"a":"é"}');
  });
});
