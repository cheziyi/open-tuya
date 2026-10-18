import { describe, expect, it } from "vitest";
import { COMMANDS } from "../commands.js";
import {
  buildSubDeviceControl,
  buildSubDeviceQuery,
  parseReport,
} from "../dataPoints.js";
import {
  buildSubDeviceStatusQuery,
  parseSubDeviceStatus,
} from "../subDevices.js";
import {
  SUB_DEVICE_STATUS_REPORT_PLAINTEXT,
  V33_SUB_DEVICE_STATUS_PLAINTEXT,
  V34_SUB_DEVICE_CONTROL_PLAINTEXT,
  V34_SUB_DEVICE_STATUS_PLAINTEXT,
  V35_SUB_DEVICE_QUERY_REPLY_PLAINTEXT,
} from "./fixtures/capturedFrames.js";

function text({ command, plaintext }: { command: number; plaintext: Buffer }) {
  return { command, plaintext: plaintext.toString() };
}

describe("buildSubDeviceQuery", () => {
  it("reads through a 3.3 gateway with DP_QUERY, naming the node and the time", () => {
    expect(
      text(buildSubDeviceQuery("3.3", "a4c1382403f05cc6", 1697030197.6)),
    ).toEqual({
      command: COMMANDS.DP_QUERY,
      plaintext: '{"cid":"a4c1382403f05cc6","t":1697030197}',
    });
  });

  it.each(["3.4", "3.5"] as const)(
    "reads through a %s gateway with DP_QUERY_NEW, naming the node alone",
    (version) => {
      expect(text(buildSubDeviceQuery(version, "a4c138ad1d974d89", 0))).toEqual(
        {
          command: COMMANDS.DP_QUERY_NEW,
          plaintext: '{"cid":"a4c138ad1d974d89"}',
        },
      );
    },
  );
});

describe("buildSubDeviceControl", () => {
  it("writes through a 3.3 gateway with CONTROL, with no devId or uid", () => {
    expect(
      text(
        buildSubDeviceControl(
          "3.3",
          "a4c1382403f05cc6",
          { "1": "manual" },
          1697030197,
        ),
      ),
    ).toEqual({
      command: COMMANDS.CONTROL,
      plaintext:
        '{"cid":"a4c1382403f05cc6","dps":{"1":"manual"},"t":1697030197}',
    });
  });

  it("writes through a 3.4 gateway as the write it acked, but for the top-level cid", () => {
    const { command, plaintext } = buildSubDeviceControl(
      "3.4",
      "lamp2SubDev",
      { "1": false },
      1770818185,
    );
    const { cid: _, ...captured } = JSON.parse(
      V34_SUB_DEVICE_CONTROL_PLAINTEXT,
    );

    expect(command).toBe(COMMANDS.CONTROL_NEW);
    expect(JSON.parse(plaintext.toString())).toEqual(captured);
  });
});

describe("parseReport", () => {
  it.each([
    ["a 3.3 push", V33_SUB_DEVICE_STATUS_PLAINTEXT, "a4c1382403f05cc6"],
    ["a 3.4 push, under data", V34_SUB_DEVICE_STATUS_PLAINTEXT, "child-b"],
    ["a 3.5 reply", V35_SUB_DEVICE_QUERY_REPLY_PLAINTEXT, "a4c138ad1d974d89"],
  ])("reads the node ID of %s", (_name, payload, nodeId) => {
    expect(parseReport(Buffer.from(payload))?.nodeId).toBe(nodeId);
  });

  it("reads no node ID where a payload names none", () => {
    expect(parseReport(Buffer.from('{"dps":{"1":true}}'))).toEqual({
      dataPoints: { "1": true },
    });
  });
});

describe("buildSubDeviceStatusQuery", () => {
  it("asks with LAN_EXT_STREAM", () => {
    expect(text(buildSubDeviceStatusQuery())).toEqual({
      command: COMMANDS.LAN_EXT_STREAM,
      plaintext: '{"data":{"cids":[]},"reqType":"subdev_online_stat_query"}',
    });
  });
});

describe("parseSubDeviceStatus", () => {
  it("reads the nodes online and offline", () => {
    expect(
      parseSubDeviceStatus(Buffer.from(SUB_DEVICE_STATUS_REPORT_PLAINTEXT)),
    ).toEqual({ online: ["0070", "0068", "0058"], offline: [] });
  });

  it("returns undefined for the empty frame before a report, or another payload", () => {
    expect(parseSubDeviceStatus(Buffer.alloc(0))).toBeUndefined();
    expect(parseSubDeviceStatus(Buffer.from('{"dps":{}}'))).toBeUndefined();
  });
});
