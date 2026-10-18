import { createSocket, type Socket } from "node:dgram";
import {
  type DataPoints,
  PROTOCOL_VERSIONS,
  type ProtocolVersion,
  TuyaError,
} from "@open-tuya/core";
import {
  type SimulatedTuyaDevice,
  startSimulatedDevice,
} from "@open-tuya/simulators";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalTuyaClient, LocalTuyaClient } from "../client.js";
import {
  type ConnectionListeners,
  openConnection,
  type TuyaConnection,
} from "../connection.js";
import { TuyaDiscovery } from "../discovery/discovery.js";
import {
  V33_QUERY_ERROR,
  V33_QUERY_ERROR_KEY,
} from "../protocol/__tests__/fixtures/capturedFrames.js";
import { LOCAL_KEY } from "../protocol/__tests__/fixtures/computedFrames.js";
import { COMMANDS } from "../protocol/commands.js";
import type { ReceivedTuyaFrame } from "../protocol/frame.js";
import { until, useFakeTimers } from "./clock.js";
import { type RawDevice, startRawDevice } from "./mocks/rawDevice.js";

const LOCAL_KEY_TEXT = LOCAL_KEY.toString();
const DEVICE_ID = "bf0123456789abcdefgh";
const DATA_POINTS = { "1": true, "2": 25, "3": "auto" };

// No source shows a 3.1 or 3.2 gateway, or a 3.2 device's broadcast.
const GATEWAY_VERSIONS = PROTOCOL_VERSIONS.filter(
  (version) => version !== "3.1" && version !== "3.2",
);
const BROADCAST_VERSIONS = PROTOCOL_VERSIONS.filter(
  (version) => version !== "3.2",
);

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

  it.skipIf(version === "3.1")(
    "numbers its writes' version headers from 1, under one source ID",
    async () => {
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
    },
  );

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

describe("LocalTuyaClient on 3.1", () => {
  it("reads under the wrong key, as a read goes in plain text, but a write times out", async () => {
    useFakeTimers();
    const device = await startDevice("3.1");
    const { client, reports } = connect(device.port, "3.1", "fedcba9876543210");

    // The read the client makes once connected.
    await until(() => reports.length > 0);
    await expect(client.readDataPoints()).resolves.toEqual(DATA_POINTS);
    const timers = vi.getTimerCount();
    const writing = expect(
      client.writeDataPoints({ "1": false }),
    ).rejects.toMatchObject({ code: "REQUEST_TIMED_OUT" });
    // The write's timer for its ack.
    await until(() => vi.getTimerCount() > timers);
    await vi.advanceTimersByTimeAsync(5000);

    await writing;
    expect(device.dataPoints["1"]).toBe(true);
  });

  it("throws a TypeError for a device behind it, as no source shows how a 3.1 gateway reaches one", async () => {
    const device = await startDevice("3.1");
    const { client } = connect(device.port, "3.1");

    expect(() => client.createClient("lamp")).toThrow(TypeError);
  });
});

describe.each(GATEWAY_VERSIONS)("a gateway on %s", (version) => {
  async function startGateway(): Promise<SimulatedTuyaDevice> {
    const device = await startSimulatedDevice({
      version,
      localKey: LOCAL_KEY_TEXT,
      subDevices: { lamp: { "1": false }, sensor: { "1": 21 } },
    });
    cleanups.push(() => device.close());
    return device;
  }

  it("reads and writes a device behind it by its node ID", async () => {
    const device = await startGateway();
    const { client } = connect(device.port, version);
    const lamp = client.createClient("lamp");

    await expect(lamp.readDataPoints()).resolves.toEqual({ "1": false });
    await lamp.writeDataPoints({ "1": true });

    expect(device.subDevices.lamp).toEqual({ "1": true });
  });

  it("reads each device behind it once connected, and hands each its own reports", async () => {
    const device = await startGateway();
    const { client, reports } = connect(device.port, version);
    const lamp = client.createClient("lamp");
    const sensor = client.createClient("sensor");
    const lampReports: DataPoints[] = [];
    const sensorReports: DataPoints[] = [];
    lamp.onDataPoints((dataPoints) => lampReports.push(dataPoints));
    sensor.onDataPoints((dataPoints) => sensorReports.push(dataPoints));
    await until(() => lampReports.length > 0 && sensorReports.length > 0);

    device.report({ "1": 22 }, "sensor");
    await until(() => sensorReports.length > 1);

    expect(lampReports).toEqual([{ "1": false }]);
    expect(sensorReports).toEqual([{ "1": 21 }, { "1": 22 }]);
    expect(reports).toEqual([]);
  });

  it("hands a reply naming another device to that device", async () => {
    const device = await startGateway();
    const { client } = connect(device.port, version);
    const sensor = client.createClient("sensor");
    const sensorReports: DataPoints[] = [];
    sensor.onDataPoints((dataPoints) => sensorReports.push(dataPoints));
    await until(() => sensorReports.length > 0 && device.ready);

    device.send(
      COMMANDS.DP_QUERY_NEW,
      Buffer.from('{"dps":{"1":30},"cid":"sensor"}'),
    );
    await until(() => sensorReports.length > 1);

    expect(sensorReports.at(-1)).toEqual({ "1": 30 });
  });

  it("closes a device's client without closing the gateway's connection", async () => {
    const device = await startGateway();
    const { client } = connect(device.port, version);
    const lamp = client.createClient("lamp");
    await lamp.readDataPoints();

    await lamp.close();

    expect(lamp.connected).toBe(false);
    expect(client.connected).toBe(true);
    await expect(lamp.readDataPoints()).rejects.toMatchObject({
      code: "CONNECTION_LOST",
    });
  });

  it("stops reading a closed device after a reconnect, and stops asking which are online once none is open", async () => {
    useFakeTimers();
    const device = await startGateway();
    const { client } = connect(device.port, version);
    const lamp = client.createClient("lamp");
    await lamp.readDataPoints();
    await lamp.close();

    device.disconnect();
    await until(() => !client.connected);
    const since = device.received.length;
    await vi.advanceTimersByTimeAsync(5000);
    await until(() =>
      device.received
        .slice(since)
        .some(
          (frame) =>
            frame.command === COMMANDS.DP_QUERY ||
            frame.command === COMMANDS.DP_QUERY_NEW,
        ),
    );
    await vi.advanceTimersByTimeAsync(30_000);

    const after = device.received.slice(since);
    expect(after.filter((frame) => frame.payload.includes("lamp"))).toEqual([]);
    expect(
      after.filter((frame) => frame.command === COMMANDS.LAN_EXT_STREAM),
    ).toEqual([]);
  });

  it("takes a device the gateway reports offline as not connected", async () => {
    const device = await startGateway();
    device.offline.add("sensor");
    const { client } = connect(device.port, version);
    const lamp = client.createClient("lamp");
    const sensor = client.createClient("sensor");
    await until(() => client.connected && !sensor.connected);

    expect(lamp.connected).toBe(true);
  });
});

describe.each(BROADCAST_VERSIONS)(
  "a client with a discovery on %s",
  (version) => {
    async function startDeviceAt(
      ip: string,
      subDevices?: Record<string, DataPoints>,
    ): Promise<SimulatedTuyaDevice> {
      const device = await startSimulatedDevice({
        version,
        localKey: LOCAL_KEY_TEXT,
        dataPoints: DATA_POINTS,
        deviceId: DEVICE_ID,
        ip,
        ...(subDevices && { subDevices }),
      });
      cleanups.push(() => device.close());
      return device;
    }

    async function startDiscovery(): Promise<{
      discovery: TuyaDiscovery;
      port: number;
    }> {
      const [broadcastSocket, answerSocket] = await Promise.all(
        [0, 1].map(async () => {
          const socket = createSocket("udp4");
          await new Promise<void>((resolve) =>
            socket.bind(0, "127.0.0.1", resolve),
          );
          return socket;
        }),
      );
      const discovery = new TuyaDiscovery(
        [broadcastSocket as Socket],
        answerSocket as Socket,
        () => [],
      );
      cleanups.push(() => discovery.close());
      return { discovery, port: (broadcastSocket as Socket).address().port };
    }

    // Every device listens on 127.0.0.1, the one loopback address on every
    // platform, so the client's addresses are mapped to the devices' ports.
    function follow(
      devices: Record<string, SimulatedTuyaDevice>,
      discovery: TuyaDiscovery,
    ) {
      const attempts: string[] = [];
      const client = new LocalTuyaClient(
        (address, listeners) => {
          attempts.push(address);
          const device = devices[address];
          return device
            ? openConnection({
                host: "127.0.0.1",
                port: device.port,
                version,
                localKey: LOCAL_KEY_TEXT,
                ...listeners,
              })
            : Promise.reject(
                new TuyaError("CONNECTION_FAILED", `Nothing at ${address}`),
              );
        },
        { version, deviceId: DEVICE_ID, host: "192.168.1.10", discovery },
      );
      cleanups.push(() => client.close());
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));
      return { client, attempts, reports };
    }

    it("stays at its address while connected, whatever discovery hears", async () => {
      const before = await startDeviceAt("192.168.1.10");
      const after = await startDeviceAt("192.168.1.20");
      const { discovery, port } = await startDiscovery();
      const { client, attempts, reports } = follow(
        { "192.168.1.10": before, "192.168.1.20": after },
        discovery,
      );
      await until(() => reports.length > 0);

      await after.broadcast(port);
      await until(() => discovery.devices.has(DEVICE_ID));
      await client.writeDataPoints({ "1": false });

      expect(attempts).toEqual(["192.168.1.10"]);
      expect(before.dataPoints["1"]).toBe(false);
      expect(after.dataPoints["1"]).toBe(true);
    });

    it("reconnects to the address discovery heard once the connection is lost", async () => {
      useFakeTimers();
      const before = await startDeviceAt("192.168.1.10");
      const after = await startDeviceAt("192.168.1.20");
      const { discovery, port } = await startDiscovery();
      const { client, attempts, reports } = follow(
        { "192.168.1.10": before, "192.168.1.20": after },
        discovery,
      );
      await until(() => reports.length > 0);

      await after.broadcast(port);
      await until(() => discovery.devices.has(DEVICE_ID));
      await before.close();
      await until(() => !client.connected);
      await vi.advanceTimersByTimeAsync(5000);
      await until(() => client.connected);
      await client.writeDataPoints({ "1": false });

      expect(attempts).toEqual(["192.168.1.10", "192.168.1.20"]);
      expect(after.dataPoints["1"]).toBe(false);
    });

    it("connects first to its host, and returns to it when the address discovery heard fails", async () => {
      useFakeTimers();
      const device = await startDeviceAt("192.168.1.10");
      const wrong = await startDeviceAt("192.168.1.30");
      const { discovery, port } = await startDiscovery();
      await wrong.broadcast(port);
      await until(() => discovery.devices.has(DEVICE_ID));
      const { client, attempts, reports } = follow(
        { "192.168.1.10": device },
        discovery,
      );
      await until(() => reports.length > 0);

      device.disconnect();
      await until(() => !client.connected);
      await vi.advanceTimersByTimeAsync(5000);
      await until(() => attempts.length === 2 && !client.connected);
      await vi.advanceTimersByTimeAsync(10_000);
      await until(() => client.connected);

      expect(attempts).toEqual([
        "192.168.1.10",
        "192.168.1.30",
        "192.168.1.10",
      ]);
    });

    it.skipIf(version === "3.1")(
      "takes the devices behind a gateway along to its new address",
      async () => {
        useFakeTimers();
        const before = await startDeviceAt("192.168.1.10", {
          lamp: { "1": false },
        });
        const after = await startDeviceAt("192.168.1.20", {
          lamp: { "1": true },
        });
        const { discovery, port } = await startDiscovery();
        const { client } = follow(
          { "192.168.1.10": before, "192.168.1.20": after },
          discovery,
        );
        const lamp = client.createClient("lamp");
        await expect(lamp.readDataPoints()).resolves.toEqual({ "1": false });

        await after.broadcast(port);
        await until(() => discovery.devices.has(DEVICE_ID));
        await before.close();
        await until(() => !client.connected);
        await vi.advanceTimersByTimeAsync(5000);
        await until(() => lamp.connected);

        await expect(lamp.readDataPoints()).resolves.toEqual({ "1": true });
      },
    );
  },
);

describe.each(["3.2", "3.3"] as const)(
  "a device read by writing null on %s",
  (version) => {
    async function startRefusing(): Promise<SimulatedTuyaDevice> {
      const device = await startDevice(version);
      device.refusesReads = true;
      return device;
    }

    function connectReading(
      device: SimulatedTuyaDevice,
      readByWritingNull: readonly string[],
    ) {
      const client = createLocalTuyaClient({
        host: "127.0.0.1",
        port: device.port,
        version,
        localKey: LOCAL_KEY_TEXT,
        deviceId: DEVICE_ID,
        readByWritingNull,
      });
      cleanups.push(() => client.close());
      const reports: DataPoints[] = [];
      client.onDataPoints((dataPoints) => reports.push(dataPoints));
      return { client, reports };
    }

    it("rejects a read with REQUEST_REJECTED without readByWritingNull", async () => {
      const device = await startRefusing();
      const { client } = connect(device.port, version);

      await expect(client.readDataPoints()).rejects.toMatchObject({
        code: "REQUEST_REJECTED",
      });
    });

    it("reads the data points it names that the device has, and changes none", async () => {
      const device = await startRefusing();
      const { client } = connectReading(device, ["1", "3", "99"]);

      await expect(client.readDataPoints()).resolves.toEqual({
        "1": true,
        "3": "auto",
      });
      expect(device.dataPoints).toEqual(DATA_POINTS);
      expect(
        device.received
          .filter((frame) => frame.command === COMMANDS.CONTROL)
          .map((frame) => JSON.parse(frame.payload.toString()).dps),
      ).toContainEqual({ "1": null, "3": null, "99": null });
    });

    it("hands its listeners the STATUS each read brings, once", async () => {
      const device = await startRefusing();
      const { client, reports } = connectReading(device, ["1", "2"]);
      await until(() => reports.length > 0);
      await client.readDataPoints();

      expect(reports).toEqual([
        { "1": true, "2": 25 },
        { "1": true, "2": 25 },
      ]);
    });

    it("rejects with REQUEST_TIMED_OUT when the device has none of the data points", async () => {
      useFakeTimers();
      const device = await startRefusing();
      const { client } = connectReading(device, ["99"]);
      const reading = expect(client.readDataPoints()).rejects.toMatchObject({
        code: "REQUEST_TIMED_OUT",
      });

      // The read the client makes once connected goes first.
      await until(() => device.received.length > 0);
      await vi.advanceTimersByTimeAsync(5000);
      await until(() => device.received.length > 1);
      await vi.advanceTimersByTimeAsync(5000);

      await reading;
    });
  },
);

describe("a read by writing null on 3.3", () => {
  function frame(command: number, payload: string): ReceivedTuyaFrame {
    return {
      sequenceNumber: 0,
      command,
      returnCode: 0,
      payload: Buffer.from(payload),
    };
  }

  it("waits for its ack after the STATUS, so the next write does not take it", async () => {
    const sent: number[] = [];
    let listeners: ConnectionListeners | undefined;
    const client = new LocalTuyaClient(
      async (_host, connectionListeners) => {
        listeners = connectionListeners;
        return {
          send: async (command: number) => {
            sent.push(command);
          },
          close: async () => {},
        } as unknown as TuyaConnection;
      },
      {
        version: "3.3",
        deviceId: DEVICE_ID,
        host: "127.0.0.1",
        readByWritingNull: ["1"],
      },
    );
    cleanups.push(() => client.close());
    // The read the client makes once connected.
    await until(() => sent.length === 1);
    let written = false;
    const writing = client.writeDataPoints({ "1": false }).then(() => {
      written = true;
    });

    listeners?.onFrame(frame(COMMANDS.STATUS, '{"dps":{"1":true}}'));
    listeners?.onFrame(frame(COMMANDS.CONTROL, ""));
    await until(() => sent.length === 2);
    await new Promise((resolve) => setImmediate(resolve));

    expect(written).toBe(false);
    listeners?.onFrame(frame(COMMANDS.CONTROL, ""));
    await writing;
    expect(sent).toEqual([COMMANDS.CONTROL, COMMANDS.CONTROL]);
  });
});

describe("readByWritingNull", () => {
  it.each(["3.1", "3.4", "3.5"] as const)(
    "throws a TypeError on %s, where no source shows a read by writing null",
    (version) => {
      expect(() =>
        createLocalTuyaClient({
          host: "127.0.0.1",
          version,
          localKey: LOCAL_KEY_TEXT,
          deviceId: DEVICE_ID,
          readByWritingNull: ["1"],
        }),
      ).toThrow(TypeError);
    },
  );

  it("throws a TypeError when empty, as a device then answers nothing", () => {
    expect(() =>
      createLocalTuyaClient({
        host: "127.0.0.1",
        version: "3.3",
        localKey: LOCAL_KEY_TEXT,
        deviceId: DEVICE_ID,
        readByWritingNull: [],
      }),
    ).toThrow(TypeError);
  });
});
