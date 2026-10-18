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
  it("subscribes with its first listener and unsubscribes with its last, never once closed", async () => {
    const transport = new FakeTransport();
    const client = new AppCloudTuyaClient(transport, DEVICE_ID, CODES);
    expect(transport.subscribes).toBe(0);

    const remove = client.onDataPoints(() => {});
    client.onDataPoints(() => {})();
    expect(transport.subscribes).toBe(1);
    remove();
    expect(transport.listeners.size).toBe(0);

    client.onDataPoints(() => {});
    expect(transport.subscribes).toBe(2);
    await client.close();
    expect(transport.listeners.size).toBe(0);
    client.onDataPoints(() => {});
    expect(transport.subscribes).toBe(2);
  });

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
