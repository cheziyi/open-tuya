import type { DataPoints } from "@open-tuya/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppCloudTuyaClient } from "../client.js";
import { FakeTransport } from "./mocks/fakeTransport.js";

const DEVICE_ID = "bf6c8539693b0cdea25thg";
const CODES = {
  statusCodesById: new Map([["1", "switch_1"]]),
  commandCodesById: new Map([["1", "switch_1"]]),
  pushedById: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppCloudTuyaClient", () => {
  it("hands a push to every listener when one throws, and rethrows it after", () => {
    const transport = new FakeTransport();
    const client = new AppCloudTuyaClient(transport, DEVICE_ID, CODES);
    const error = new Error("The listener failed");
    const reports: DataPoints[] = [];
    client.onDataPoints(() => {
      throw error;
    });
    client.onDataPoints((dataPoints) => reports.push(dataPoints));
    const rethrows: (() => void)[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) =>
      rethrows.push(callback),
    );

    expect(() => transport.push({ "1": true })).not.toThrow();

    vi.restoreAllMocks();
    expect(reports).toEqual([{ "1": true }]);
    expect(rethrows).toHaveLength(1);
    expect(rethrows[0]).toThrow(error);
  });
});
