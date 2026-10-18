import { createSocket } from "node:dgram";
import { connect, createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_KEY,
  V35_SESSION_KEY_START,
} from "../../../local/src/protocol/__tests__/fixtures/computedFrames.js";
import { type SimulatedTuyaDevice, startSimulatedDevice } from "../device.js";

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function start(version: "3.3" | "3.5"): Promise<SimulatedTuyaDevice> {
  const device = await startSimulatedDevice({
    version,
    localKey: LOCAL_KEY.toString(),
  });
  cleanups.push(() => device.close());
  return device;
}

async function open(port: number): Promise<Socket> {
  const socket = connect(port, "127.0.0.1");
  socket.on("error", () => {});
  // Flowing, the socket reads to the end of what the device sends, and so
  // sees the device close it.
  socket.resume();
  cleanups.push(() => socket.destroy());
  await new Promise((resolve) => socket.once("connect", resolve));
  return socket;
}

function closed(socket: Socket): Promise<void> {
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

async function listenOn(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

async function bindTo(port: number): Promise<void> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => socket.close(() => resolve()));
}

describe("SimulatedTuyaDevice", () => {
  it("releases both its ports at the end of an await using scope, closed twice", async () => {
    let port: number;
    let requestPort: number;
    {
      await using device = await startSimulatedDevice({
        version: "3.3",
        localKey: "0123456789abcdef",
      });
      ({ port, requestPort } = device);
      await device.close();
    }

    await expect(listenOn(port)).resolves.toBeUndefined();
    await expect(bindTo(requestPort)).resolves.toBeUndefined();
  });

  it("serves 3 clients at once, and closes the connection of a fourth", async () => {
    const device = await start("3.3");
    const clients = await Promise.all([0, 1, 2].map(() => open(device.port)));
    await vi.waitUntil(() => device.ready);

    const fourth = await open(device.port);

    await closed(fourth);
    expect(clients.every((client) => !client.destroyed)).toBe(true);
  });

  it("closes a connection that carries no frame for 30 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const device = await start("3.3");
    const client = await open(device.port);
    const closing = closed(client);
    await vi.waitUntil(() => device.ready);

    await vi.advanceTimersByTimeAsync(30_000);

    await closing;
  });

  it("closes a 3.5 connection on a frame whose sequence number is not above the last", async () => {
    const device = await start("3.5");
    const client = await open(device.port);
    const closing = closed(client);

    client.write(Buffer.concat([V35_SESSION_KEY_START, V35_SESSION_KEY_START]));

    await closing;
    expect(device.received).toHaveLength(1);
  });
});
