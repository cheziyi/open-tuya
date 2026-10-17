import {
  type DataPoints,
  PROTOCOL_VERSIONS,
  type ProtocolVersion,
} from "@open-tuya/core";
import {
  type SimulatedTuyaDevice,
  startSimulatedDevice,
} from "@open-tuya/simulators";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalTuyaClient, type LocalTuyaClient } from "../client.js";
import {
  V33_QUERY_ERROR,
  V33_QUERY_ERROR_KEY,
} from "../protocol/__tests__/fixtures/capturedFrames.js";
import { LOCAL_KEY } from "../protocol/__tests__/fixtures/computedFrames.js";
import { until, useFakeTimers } from "./clock.js";
import { type RawDevice, startRawDevice } from "./mocks/rawDevice.js";

const LOCAL_KEY_TEXT = LOCAL_KEY.toString();
const DEVICE_ID = "bf0123456789abcdefgh";
const DATA_POINTS = { "1": true, "2": 25, "3": "auto" };

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function startDevice(
  version: ProtocolVersion,
  dataPoints: DataPoints = DATA_POINTS,
): Promise<SimulatedTuyaDevice> {
  const device = await startSimulatedDevice({
    version,
    localKey: LOCAL_KEY_TEXT,
    dataPoints,
  });
  cleanups.push(() => device.close());
  return device;
}

async function startRaw(answer: Uint8Array): Promise<RawDevice> {
  const device = await startRawDevice(Buffer.alloc(0), answer);
  cleanups.push(() => device.close());
  return device;
}

function connect(
  port: number,
  version: ProtocolVersion,
  localKey = LOCAL_KEY_TEXT,
): { client: LocalTuyaClient; reports: DataPoints[] } {
  const client = createLocalTuyaClient({
    host: "127.0.0.1",
    port,
    version,
    localKey,
    deviceId: DEVICE_ID,
  });
  cleanups.push(() => client.close());
  const reports: DataPoints[] = [];
  client.onDataPoints((dataPoints) => reports.push(dataPoints));
  return { client, reports };
}

describe.each(PROTOCOL_VERSIONS)("LocalTuyaClient on %s", (version) => {
  it("reads the data points the device holds", async () => {
    const device = await startDevice(version);
    const { client } = connect(device.port, version);

    await expect(client.readDataPoints()).resolves.toEqual(DATA_POINTS);
  });

  it("reads the data points once connected, for its listeners", async () => {
    const device = await startDevice(version);
    const { reports } = connect(device.port, version);

    await until(() => reports.length > 0);

    expect(reports).toEqual([DATA_POINTS]);
  });

  it("writes data points, and hands on the STATUS the device sends after", async () => {
    const device = await startDevice(version);
    const { client, reports } = connect(device.port, version);
    await until(() => reports.length > 0);

    await client.writeDataPoints({ "1": false, "3": "eco" });
    await until(() => reports.length > 1);

    expect(device.dataPoints).toEqual({
      ...DATA_POINTS,
      "1": false,
      "3": "eco",
    });
    expect(reports.at(-1)).toEqual({ "1": false, "3": "eco" });
  });

  it("numbers its writes' version headers from 1, under one source ID", async () => {
    const device = await startDevice(version);
    const { client } = connect(device.port, version);

    await client.writeDataPoints({ "2": 30 });
    await client.writeDataPoints({ "2": 31 });

    const headers = device.received
      .filter((frame) => frame.versionHeader)
      .map((frame) => frame.versionHeader);
    expect(headers).toEqual([
      { serialNumber: 1, sourceId: expect.any(Number) },
      { serialNumber: 2, sourceId: headers[0]?.sourceId },
    ]);
    expect(headers[0]?.sourceId).toBeGreaterThanOrEqual(1000);
    expect(headers[0]?.sourceId).toBeLessThanOrEqual(1_000_999);
  });

  it("resolves a write the device only acks", async () => {
    const device = await startDevice(version);
    device.pushesAfterWrite = false;
    const { client } = connect(device.port, version);

    await client.writeDataPoints({ "2": 30 });

    expect(device.dataPoints["2"]).toBe(30);
  });

  it("hands what the device reports to each listener until it unsubscribes", async () => {
    const device = await startDevice(version);
    const { client, reports } = connect(device.port, version);
    const others: DataPoints[] = [];
    const unsubscribe = client.onDataPoints((dataPoints) =>
      others.push(dataPoints),
    );
    await until(() => reports.length > 0 && device.ready);

    device.report({ "2": 26 });
    await until(() => reports.length > 1);
    unsubscribe();
    device.report({ "2": 27 });
    await until(() => reports.length > 2);

    expect(reports.slice(1)).toEqual([{ "2": 26 }, { "2": 27 }]);
    expect(others).toEqual([DATA_POINTS, { "2": 26 }]);
  });

  it("sends one request at a time", async () => {
    const device = await startDevice(version);
    const { client } = connect(device.port, version);

    const [before, , after] = await Promise.all([
      client.readDataPoints(),
      client.writeDataPoints({ "2": 40 }),
      client.readDataPoints(),
    ]);

    expect(before["2"]).toBe(25);
    expect(after["2"]).toBe(40);
  });

  it("rejects a read with REQUEST_REJECTED when the device holds no data point", async () => {
    const device = await startDevice(version, {});
    const { client } = connect(device.port, version);

    await expect(client.readDataPoints()).rejects.toMatchObject({
      code: "REQUEST_REJECTED",
      message: expect.stringContaining("json obj data unvalid"),
    });
  });

  it("reconnects 5 s after the device closes the connection, and reads again", async () => {
    useFakeTimers();
    const device = await startDevice(version);
    const { client, reports } = connect(device.port, version);
    await until(() => reports.length > 0 && device.ready);

    device.disconnect();
    await until(() => !device.ready);
    await expect(client.readDataPoints()).rejects.toMatchObject({
      code: "CONNECTION_LOST",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => reports.length > 1);

    expect(reports).toEqual([DATA_POINTS, DATA_POINTS]);
  });

  it("is connected while its connection is open", async () => {
    useFakeTimers();
    const device = await startDevice(version);
    const { client, reports } = connect(device.port, version);
    expect(client.connected).toBe(false);
    await until(() => reports.length > 0);
    expect(client.connected).toBe(true);

    device.disconnect();
    await until(() => !client.connected);
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => client.connected);
    await client.close();

    expect(client.connected).toBe(false);
  });

  it("rejects requests with CONNECTION_LOST once closed", async () => {
    const device = await startDevice(version);
    const { client } = connect(device.port, version);
    await client.readDataPoints();

    client.close();

    await expect(client.readDataPoints()).rejects.toMatchObject({
      code: "CONNECTION_LOST",
    });
  });

  it("closes its connection at the end of an await using scope", async () => {
    const device = await startDevice(version);
    {
      await using client = connect(device.port, version).client;
      await client.readDataPoints();
    }

    await until(() => !device.ready);
  });

  it("closes while its connection is still opening", async () => {
    const device = await startDevice(version);
    const { client } = connect(device.port, version);

    await client.close();

    await until(() => !device.ready);
    await expect(client.readDataPoints()).rejects.toMatchObject({
      code: "CONNECTION_LOST",
    });
  });
});

describe("LocalTuyaClient", () => {
  it("rejects with REQUEST_REJECTED when the device answers with an error", async () => {
    const device = await startRaw(V33_QUERY_ERROR);
    const { client } = connect(
      device.port,
      "3.3",
      V33_QUERY_ERROR_KEY.toString(),
    );

    await expect(client.readDataPoints()).rejects.toMatchObject({
      code: "REQUEST_REJECTED",
      message: expect.stringContaining("parse data error"),
    });
  });

  it("rejects with the error of a reply it cannot read", async () => {
    const device = await startRaw(V33_QUERY_ERROR);
    const { client } = connect(device.port, "3.3");

    await expect(client.readDataPoints()).rejects.toMatchObject({
      code: "DECRYPTION_FAILED",
    });
  });

  it("rejects with REQUEST_TIMED_OUT when the device does not answer within 5 s", async () => {
    useFakeTimers();
    const device = await startRaw(Buffer.alloc(0));
    const { client } = connect(device.port, "3.3");
    await until(() => device.received.length > 0);
    const reading = client.readDataPoints();
    const rejected = expect(reading).rejects.toMatchObject({
      code: "REQUEST_TIMED_OUT",
    });

    // The read the client makes once connected goes first.
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => device.received.length > 1);
    await vi.advanceTimersByTimeAsync(5000);

    await rejected;
  });

  it("rejects with the RangeError of a local key that is not 16 bytes, and does not reconnect", async () => {
    useFakeTimers();
    const { client } = connect(6668, "3.3", "short");

    await expect(client.readDataPoints()).rejects.toThrow(RangeError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
