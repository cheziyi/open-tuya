import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import {
  buildControl,
  buildNullRead,
  buildQuery,
  parseDataPoints,
} from "../dataPoints.js";
import {
  V33_QUERY_ERROR_PLAINTEXT,
  V33_QUERY_REPLY_PLAINTEXT,
  V33_STATUS_PLAINTEXT,
  V35_QUERY_ERROR_PLAINTEXT,
  V35_QUERY_REPLY_PLAINTEXT,
  V35_STATUS_PLAINTEXT,
} from "./fixtures/capturedFrames.js";

const DEVICE_ID = "bf0123456789abcdefgh";

function text({ command, plaintext }: { command: number; plaintext: Buffer }) {
  return { command, plaintext: plaintext.toString() };
}

describe("buildQuery", () => {
  it.each(["3.1", "3.3"] as const)(
    "asks a %s device with DP_QUERY, naming it twice",
    (version) => {
      expect(text(buildQuery(version, DEVICE_ID))).toEqual({
        command: COMMANDS.DP_QUERY,
        plaintext: `{"devId":"${DEVICE_ID}","gwId":"${DEVICE_ID}"}`,
      });
    },
  );

  it.each(["3.4", "3.5"] as const)(
    "asks a %s device with DP_QUERY_NEW and an empty object",
    (version) => {
      expect(text(buildQuery(version, DEVICE_ID))).toEqual({
        command: COMMANDS.DP_QUERY_NEW,
        plaintext: "{}",
      });
    },
  );
});

describe("buildControl", () => {
  it("writes to a 3.3 device with CONTROL, t in whole seconds", () => {
    expect(
      text(buildControl("3.3", DEVICE_ID, { "1": true }, 1700000000.9)),
    ).toEqual({
      command: COMMANDS.CONTROL,
      plaintext: `{"devId":"${DEVICE_ID}","dps":{"1":true},"t":1700000000,"uid":""}`,
    });
  });

  it("writes to a 3.1 device with CONTROL, t a string of whole seconds", () => {
    expect(
      text(buildControl("3.1", DEVICE_ID, { "1": true }, 1700000000.9)),
    ).toEqual({
      command: COMMANDS.CONTROL,
      plaintext: `{"devId":"${DEVICE_ID}","dps":{"1":true},"t":"1700000000","uid":""}`,
    });
  });

  it.each(["3.4", "3.5"] as const)(
    "writes to a %s device with CONTROL_NEW, the data points under data",
    (version) => {
      expect(
        text(buildControl(version, DEVICE_ID, { "1": true }, 1700000000.9)),
      ).toEqual({
        command: COMMANDS.CONTROL_NEW,
        plaintext: '{"data":{"dps":{"1":true}},"protocol":5,"t":1700000000}',
      });
    },
  );

  it("keeps the spaces inside a string value", () => {
    expect(
      buildControl("3.3", DEVICE_ID, { "101": "a b" }, 0).plaintext.toString(),
    ).toContain('"101":"a b"');
  });
});

describe("parseDataPoints", () => {
  it.each([
    ["a 3.3 reply", V33_QUERY_REPLY_PLAINTEXT, "21", "colour"],
    ["a 3.3 STATUS", V33_STATUS_PLAINTEXT, "3", 0],
    ["a 3.5 reply", V35_QUERY_REPLY_PLAINTEXT, "101", "TM1809"],
    ["a 3.5 STATUS, under data", V35_STATUS_PLAINTEXT, "20", false],
  ])("reads the data points of %s", (_name, payload, id, value) => {
    expect(parseDataPoints(Buffer.from(payload))).toMatchObject({
      [id]: value,
    });
  });

  it.each([
    V33_QUERY_ERROR_PLAINTEXT,
    V35_QUERY_ERROR_PLAINTEXT,
    '{"t":1700000000}',
  ])("returns undefined for %j", (payload) => {
    expect(parseDataPoints(Buffer.from(payload))).toBeUndefined();
  });
});

describe("buildNullRead", () => {
  it("writes null to each data point with CONTROL", () => {
    expect(text(buildNullRead(DEVICE_ID, ["1", "7"], 1700000000.9))).toEqual({
      command: COMMANDS.CONTROL,
      plaintext: `{"devId":"${DEVICE_ID}","dps":{"1":null,"7":null},"t":1700000000,"uid":""}`,
    });
  });
});
