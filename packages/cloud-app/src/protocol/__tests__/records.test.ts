import { describe, expect, it } from "vitest";
import {
  readDeviceRecords,
  readDeviceReport,
  readHomeRecords,
  readLoginResult,
  readPushConfig,
  readRefreshResult,
  readStatusRelations,
} from "../records.js";
import { PUSH_CONFIG } from "./fixtures/capturedResponses.js";

const REFRESH_RESULT = {
  accessToken: "access-2",
  refreshToken: "refresh-2",
  expireTime: 7200,
  uid: "eu0000000000000aaaa",
};

function push(message: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

describe("the result readers", () => {
  it("hand back a result that has every field", () => {
    expect(readRefreshResult(REFRESH_RESULT)).toBe(REFRESH_RESULT);
    expect(readPushConfig(PUSH_CONFIG)).toBe(PUSH_CONFIG);
    expect(readStatusRelations({})).toEqual([]);
  });

  // Source: A result of "" on a success, in
  // https://github.com/tuya/tuya-device-sharing-sdk/commit/a83b3887e51070be6e799bd48bbd3e9904752d75.
  it.each([
    ["no homes", () => readHomeRecords(null)],
    ["a home without an owner", () => readHomeRecords([{ name: "Home" }])],
    ["devices as an empty string", () => readDeviceRecords("")],
    ["a device that is null", () => readDeviceRecords([null])],
    ["a device without an ID", () => readDeviceRecords([{ name: "Plug" }])],
    [
      "a status that is not a list",
      () => readDeviceRecords([{ id: "bf", status: 5 }]),
    ],
    ["relations that are null", () => readStatusRelations(null)],
    [
      "relations that are not a list",
      () => readStatusRelations({ dpStatusRelationDTOS: "" }),
    ],
    [
      "a refresh without expireTime",
      () => readRefreshResult({ ...REFRESH_RESULT, expireTime: undefined }),
    ],
    [
      "a refresh whose expireTime is not a number",
      () => readRefreshResult({ ...REFRESH_RESULT, expireTime: "7200" }),
    ],
    [
      "a login without an endpoint",
      () =>
        readLoginResult({
          access_token: "a",
          refresh_token: "r",
          expire_time: 7200,
        }),
    ],
    [
      "push credentials without a topic",
      () => readPushConfig({ ...PUSH_CONFIG, topic: {} }),
    ],
    [
      "push credentials without expireTime",
      () => readPushConfig({ ...PUSH_CONFIG, expireTime: 0 }),
    ],
  ])("throw REQUEST_REJECTED on %s", (_, read) => {
    expect(read).toThrow(expect.objectContaining({ code: "REQUEST_REJECTED" }));
  });
});

describe("readDeviceReport", () => {
  it("reads a device's data points by ID", () => {
    expect(
      readDeviceReport(
        push({
          protocol: 4,
          data: {
            devId: "bf",
            status: [
              { dpId: 1, t: 1777624144986, value: true },
              null,
              { dpId: 2 },
              { code: "switch_1", value: false },
            ],
          },
        }),
      ),
    ).toEqual({ devId: "bf", dataPoints: { "1": true } });
  });

  it.each([
    ["not JSON", new TextEncoder().encode("not json")],
    ["null", push(null)],
    ["another protocol", push({ protocol: 20, data: { bizCode: "online" } })],
    ["no data", push({ protocol: 4 })],
    ["no device ID", push({ protocol: 4, data: { status: [] } })],
    [
      "a status that is not a list",
      push({ protocol: 4, data: { devId: "bf", status: 5 } }),
    ],
  ])("reads nothing from %s", (_, payload) => {
    expect(readDeviceReport(payload)).toBeUndefined();
  });
});
