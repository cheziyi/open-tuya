import { describe, expect, it } from "vitest";
import { signRequest } from "../request.js";
import {
  ACCESS_TOKEN,
  CLIENT_ID,
  COMMANDS_BODY,
  COMMANDS_SIGN,
  DEVICE_SIGN,
  QUERY_SIGN,
  SECRET,
  TIME_IN_MS,
  TOKEN_SIGN,
} from "./fixtures/computedRequests.js";

const COMMON = {
  clientId: CLIENT_ID,
  secret: SECRET,
  timeInMs: TIME_IN_MS,
};

describe("signRequest", () => {
  it("signs the token request without a token", () => {
    const signed = signRequest({
      ...COMMON,
      accessToken: "",
      method: "GET",
      path: "/v1.0/token",
      query: { grant_type: "1" },
    });

    expect(signed).toEqual({
      target: "/v1.0/token?grant_type=1",
      headers: {
        client_id: CLIENT_ID,
        sign: TOKEN_SIGN,
        sign_method: "HMAC-SHA256",
        t: String(TIME_IN_MS),
      },
    });
  });

  it("signs a request with its token", () => {
    const signed = signRequest({
      ...COMMON,
      accessToken: ACCESS_TOKEN,
      method: "GET",
      path: "/v1.0/devices/bf0123456789abcdefgh",
    });

    expect(signed.headers.sign).toBe(DEVICE_SIGN);
    expect(signed.headers.access_token).toBe(ACCESS_TOKEN);
  });

  it("signs the query with its keys sorted and unencoded, and sends it encoded", () => {
    const signed = signRequest({
      ...COMMON,
      accessToken: ACCESS_TOKEN,
      method: "GET",
      path: "/v1.3/iot-03/devices",
      query: { page_size: "75", source_type: "tuyaUser", source_id: "UID" },
    });
    const listed = signRequest({
      ...COMMON,
      accessToken: ACCESS_TOKEN,
      method: "GET",
      path: "/v1.0/iot-03/devices",
      query: { device_ids: "bf01,bf02" },
    });

    expect(signed.headers.sign).toBe(QUERY_SIGN);
    expect(signed.target).toBe(
      "/v1.3/iot-03/devices?page_size=75&source_id=UID&source_type=tuyaUser",
    );
    expect(listed.target).toBe("/v1.0/iot-03/devices?device_ids=bf01%2Cbf02");
  });

  it("signs the exact bytes of the body", () => {
    const signed = signRequest({
      ...COMMON,
      accessToken: ACCESS_TOKEN,
      method: "POST",
      path: "/v1.0/iot-03/devices/bf0123456789abcdefgh/commands",
      body: COMMANDS_BODY,
    });

    expect(signed.headers.sign).toBe(COMMANDS_SIGN);
    expect(signed.headers["Content-Type"]).toBe("application/json");
  });
});
