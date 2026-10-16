import { type AddressInfo, createServer } from "node:net";
import {
  PROTOCOL_VERSIONS,
  type ProtocolVersion,
  type TuyaError,
} from "@open-tuya/core";
import {
  type SimulatedTuyaDevice,
  startSimulatedDevice,
} from "@open-tuya/simulators";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openConnection, type TuyaConnection } from "../connection.js";
import {
  CONTROL_PLAINTEXT,
  LOCAL_KEY,
  STATUS_PLAINTEXT,
  V33_STATUS,
} from "../protocol/__tests__/fixtures/computedFrames.js";
import { COMMANDS } from "../protocol/commands.js";
import type { ReceivedTuyaFrame } from "../protocol/frame.js";
import { type RawDevice, startRawDevice } from "./mocks/rawDevice.js";

const LOCAL_KEY_TEXT = LOCAL_KEY.toString();
const STATUS = 0x08;

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

// The sockets stay real, so only the timers the connection sets are faked.
function useFakeTimers(): void {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
}

async function until(condition: () => boolean): Promise<void> {
  for (let turn = 0; turn < 1000; turn += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("The condition never held");
}

async function startDevice(
  version: ProtocolVersion,
): Promise<SimulatedTuyaDevice> {
  const device = await startSimulatedDevice({
    version,
    localKey: LOCAL_KEY_TEXT,
  });
  cleanups.push(() => device.close());
  return device;
}

async function startRaw(bytes: Uint8Array): Promise<RawDevice> {
  const device = await startRawDevice(bytes);
  cleanups.push(() => device.close());
  return device;
}

function open(
  port: number,
  version: ProtocolVersion,
  localKey = LOCAL_KEY_TEXT,
) {
  const frames: ReceivedTuyaFrame[] = [];
  const dropped: TuyaError[] = [];
  const closes: (TuyaError | undefined)[] = [];
  const opening = openConnection({
    host: "127.0.0.1",
    port,
    version,
    localKey,
    onFrame: (frame) => frames.push(frame),
    onDroppedFrame: (error) => dropped.push(error),
    onClose: (error) => closes.push(error),
  });
  const connection = opening.then((connection: TuyaConnection) => {
    cleanups.push(() => connection.close());
    return connection;
  });
  return { connection, frames, dropped, closes };
}

describe.each(PROTOCOL_VERSIONS)("openConnection on %s", (version) => {
  it("sends a frame the device reads", async () => {
    const device = await startDevice(version);
    const connection = await open(device.port, version).connection;

    await connection.send(COMMANDS.CONTROL, Buffer.from(CONTROL_PLAINTEXT));
    await until(() =>
      device.received.some((frame) => frame.command === COMMANDS.CONTROL),
    );

    expect(device.received.at(-1)?.payload.toString()).toBe(CONTROL_PLAINTEXT);
  });

  it("numbers its frames from 1, the session key negotiation included", async () => {
    const device = await startDevice(version);
    const connection = await open(device.port, version).connection;

    await connection.send(COMMANDS.CONTROL, Buffer.from(CONTROL_PLAINTEXT));
    await until(() =>
      device.received.some((frame) => frame.command === COMMANDS.CONTROL),
    );

    expect(
      device.received.map(({ sequenceNumber, command }) => [
        sequenceNumber,
        command,
      ]),
    ).toEqual(
      version === "3.3"
        ? [[1, COMMANDS.CONTROL]]
        : [
            [1, COMMANDS.SESS_KEY_NEG_START],
            [2, COMMANDS.SESS_KEY_NEG_FINISH],
            [3, COMMANDS.CONTROL],
          ],
    );
  });

  it("hands on a frame the device pushes, decrypted and without its version header", async () => {
    const device = await startDevice(version);
    const { connection, frames } = open(device.port, version);
    await connection;
    await until(() => device.ready);

    device.send(STATUS, Buffer.from(STATUS_PLAINTEXT));
    await until(() => frames.length > 0);

    expect(frames).toEqual([
      expect.objectContaining({
        command: STATUS,
        returnCode: 0,
        payload: Buffer.from(STATUS_PLAINTEXT),
      }),
    ]);
  });

  it("sends an empty heartbeat every 10 s, and keeps the replies to itself", async () => {
    useFakeTimers();
    const device = await startDevice(version);
    const { connection, frames, closes } = open(device.port, version);
    await connection;
    await until(() => device.ready);
    const heartbeats = () =>
      device.received.filter((frame) => frame.command === COMMANDS.HEART_BEAT);

    for (const count of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(10_000);
      await until(() => heartbeats().length === count);
      // The device's frames arrive in order, so the connection has read the
      // heartbeat reply once this STATUS arrives, before the next heartbeat.
      device.send(STATUS, Buffer.from(STATUS_PLAINTEXT));
      await until(() => frames.length === count);
    }

    expect(heartbeats().map((frame) => frame.payload)).toEqual([
      Buffer.alloc(0),
      Buffer.alloc(0),
      Buffer.alloc(0),
    ]);
    expect(frames.map((frame) => frame.command)).toEqual([
      STATUS,
      STATUS,
      STATUS,
    ]);
    expect(closes).toEqual([]);
  });

  it("closes with CONNECTION_LOST once 2 heartbeats go unanswered", async () => {
    useFakeTimers();
    const device = await startDevice(version);
    device.answersHeartbeats = false;
    const { connection, closes } = open(device.port, version);
    await connection;

    await vi.advanceTimersByTimeAsync(20_000);
    expect(closes).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(closes).toEqual([
      expect.objectContaining({ code: "CONNECTION_LOST" }),
    ]);
  });

  it("closes with CONNECTION_LOST when the device closes the connection", async () => {
    const device = await startDevice(version);
    const { connection, closes } = open(device.port, version);
    await connection;
    await until(() => device.ready);

    device.disconnect();
    await until(() => closes.length > 0);

    expect(closes).toEqual([
      expect.objectContaining({ code: "CONNECTION_LOST" }),
    ]);
  });

  it("closes with no error on close, and then rejects a send with CONNECTION_LOST", async () => {
    const device = await startDevice(version);
    const { connection: opening, closes } = open(device.port, version);
    const connection = await opening;

    connection.close();

    expect(closes).toEqual([undefined]);
    await expect(
      connection.send(COMMANDS.CONTROL, Buffer.from(CONTROL_PLAINTEXT)),
    ).rejects.toMatchObject({ code: "CONNECTION_LOST" });
  });
});

describe.each(["3.4", "3.5"] as const)("openConnection on %s", (version) => {
  it("rejects with SESSION_KEY_NEGOTIATION_FAILED under the wrong local key", async () => {
    const device = await startDevice(version);

    await expect(
      open(device.port, version, "fedcba9876543210").connection,
    ).rejects.toMatchObject({ code: "SESSION_KEY_NEGOTIATION_FAILED" });
  });

  it("rejects with SESSION_KEY_NEGOTIATION_FAILED when the device does not answer within 10 s", async () => {
    useFakeTimers();
    const device = await startRaw(Buffer.alloc(0));
    const opening = open(device.port, version).connection;
    const rejected = expect(opening).rejects.toMatchObject({
      code: "SESSION_KEY_NEGOTIATION_FAILED",
    });
    // SESS_KEY_NEG_START goes out once the 10 s have started.
    await until(() => device.received.length > 0);

    await vi.advanceTimersByTimeAsync(10_000);

    await rejected;
  });
});

describe("openConnection", () => {
  it("throws a RangeError for a local key that is not 16 bytes", async () => {
    await expect(open(6668, "3.3", "short").connection).rejects.toThrow(
      RangeError,
    );
  });

  it("rejects with CONNECTION_FAILED when nothing listens on the port", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));

    await expect(open(port, "3.3").connection).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
  });

  it("rejects with CONNECTION_FAILED when no connection opens within 5 s", async () => {
    useFakeTimers();
    // 192.0.2.1 is reserved for documentation, so nothing answers there.
    const opening = openConnection({
      host: "192.0.2.1",
      version: "3.3",
      localKey: LOCAL_KEY_TEXT,
      onFrame: () => {},
      onDroppedFrame: () => {},
      onClose: () => {},
    });
    const rejected = expect(opening).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });

    await vi.advanceTimersByTimeAsync(5000);

    await rejected;
  });

  it("drops a frame whose CRC is wrong, and hands on the frame after it", async () => {
    const corrupted = Buffer.from(V33_STATUS);
    corrupted.writeUInt32BE(0xdeadbeef, corrupted.length - 8);
    const device = await startRaw(Buffer.concat([corrupted, V33_STATUS]));
    const { connection, frames, dropped, closes } = open(device.port, "3.3");
    await connection;

    await until(() => frames.length + dropped.length === 2);

    expect(dropped).toEqual([
      expect.objectContaining({ code: "MALFORMED_FRAME" }),
    ]);
    expect(frames).toEqual([
      expect.objectContaining({ payload: Buffer.from(STATUS_PLAINTEXT) }),
    ]);
    expect(closes).toEqual([]);
  });

  it("closes with CONNECTION_LOST when the device sends a length field out of range", async () => {
    const outOfRange = Buffer.from(V33_STATUS);
    outOfRange.writeUInt32BE(0xffff, 12);
    const device = await startRaw(outOfRange);
    const { connection, closes } = open(device.port, "3.3");
    await connection;

    await until(() => closes.length > 0);

    expect(closes).toEqual([
      expect.objectContaining({
        code: "CONNECTION_LOST",
        cause: expect.objectContaining({ code: "MALFORMED_FRAME" }),
      }),
    ]);
  });
});
