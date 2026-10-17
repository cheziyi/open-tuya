import { type AddressInfo, createServer, type Socket } from "node:net";
import type { TuyaError } from "@open-tuya/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { until, useFakeTimers } from "../../__tests__/clock.js";
import { type Broker, startBroker } from "../../__tests__/mocks/broker.js";
import {
  PUSH_TOPIC,
  PUSHED_REPORT,
} from "../../protocol/__tests__/fixtures/capturedResponses.js";
import { type MqttConnection, openMqttConnection } from "../connection.js";
import type { PublishedMessage } from "../packet.js";

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function broker(password?: string): Promise<Broker> {
  const started = await startBroker(password ? { password } : {});
  cleanups.push(() => started.close());
  return started;
}

interface Opened {
  connection: MqttConnection;
  messages: PublishedMessage[];
  closes: (TuyaError | undefined)[];
}

async function open(url: string, password = "secret"): Promise<Opened> {
  const messages: PublishedMessage[] = [];
  const closes: (TuyaError | undefined)[] = [];
  const connection = await openMqttConnection({
    url,
    clientId: "cloud_client",
    username: "cloud_user",
    password,
    onMessage: (message) => messages.push(message),
    onClose: (error) => closes.push(error),
  });
  cleanups.push(() => connection.close());
  return { connection, messages, closes };
}

// A TCP server that writes `bytes` to each client as it connects, and nothing
// more.
async function startRawServer(bytes: Uint8Array): Promise<string> {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.on("error", () => {});
    socket.write(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
    return new Promise((resolve) => server.close(resolve));
  });
  return `tcp://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("openMqttConnection", () => {
  it("connects with a clean session, its client ID, username and password", async () => {
    const started = await broker("secret");
    await open(started.url);

    expect(started.connects).toEqual([
      { clientId: "cloud_client", username: "cloud_user", password: "secret" },
    ]);
    expect(started.clients[0]?.clean).toBe(true);
  });

  it("hands on what the broker publishes to a topic it subscribed", async () => {
    const started = await broker();
    const { connection, messages } = await open(started.url);

    connection.subscribe(PUSH_TOPIC);
    await until(() => started.subscriptions.length > 0);
    await started.publish(PUSH_TOPIC, PUSHED_REPORT);
    await until(() => messages.length > 0);

    expect(started.subscriptions).toEqual([PUSH_TOPIC]);
    expect(messages.map(({ topic, payload }) => [topic, `${payload}`])).toEqual(
      [[PUSH_TOPIC, PUSHED_REPORT]],
    );
  });

  it("reads a payload larger than one byte of remaining length can hold", async () => {
    const started = await broker();
    const { connection, messages } = await open(started.url);
    const payload = "x".repeat(20_000);

    connection.subscribe("big");
    await until(() => started.subscriptions.length > 0);
    await started.publish("big", payload);
    await until(() => messages.length > 0);

    expect(`${messages[0]?.payload}`).toBe(payload);
  });

  it("unsubscribes", async () => {
    const started = await broker();
    const { connection } = await open(started.url);

    connection.subscribe(PUSH_TOPIC);
    connection.unsubscribe(PUSH_TOPIC);
    await until(() => started.unsubscriptions.length > 0);

    expect(started.unsubscriptions).toEqual([PUSH_TOPIC]);
  });

  it("rejects with CONNECTION_FAILED when the broker refuses the credentials", async () => {
    const started = await broker("secret");

    await expect(open(started.url, "wrong")).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
  });

  it("rejects with CONNECTION_FAILED when nothing listens", async () => {
    const url = await startRawServer(Buffer.alloc(0));
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }

    await expect(open(url)).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
  });

  it("rejects with CONNECTION_FAILED when no CONNACK comes within 10 s", async () => {
    const url = await startRawServer(Buffer.alloc(0));
    useFakeTimers();

    const opening = open(url);
    const rejected = expect(opening).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await rejected;
  });

  it("keeps the connection while the broker answers its pings", async () => {
    const started = await broker();
    useFakeTimers();
    const { closes } = await open(started.url);
    let pings = 0;
    started.aedes.on("ping", () => pings++);

    for (let beat = 1; beat <= 3; beat++) {
      await vi.advanceTimersByTimeAsync(60_000);
      await until(() => pings === beat);
      // The broker has the ping; give its answer real time to come back
      // before the next ping is due.
      const sent = performance.now();
      await until(() => performance.now() - sent > 20);
    }

    expect(closes).toEqual([]);
  });

  it("closes with CONNECTION_LOST once a ping goes unanswered until the next", async () => {
    const url = await startRawServer(Buffer.from([0x20, 0x02, 0x00, 0x00]));
    useFakeTimers();
    const { closes } = await open(url);

    await vi.advanceTimersByTimeAsync(120_000);

    expect(closes).toEqual([
      expect.objectContaining({ code: "CONNECTION_LOST" }),
    ]);
  });

  it("closes with CONNECTION_LOST when the broker drops it", async () => {
    const started = await broker();
    const { closes } = await open(started.url);

    started.clients[0]?.close();
    await until(() => closes.length > 0);

    expect(closes).toEqual([
      expect.objectContaining({ code: "CONNECTION_LOST" }),
    ]);
  });

  it("sends DISCONNECT on close, and closes once with no error", async () => {
    const started = await broker();
    const { connection, closes } = await open(started.url);
    let disconnects = 0;
    started.aedes.on("clientDisconnect", () => disconnects++);

    await connection.close();
    await connection.close();
    await until(() => disconnects > 0);

    expect(closes).toEqual([undefined]);
  });
});
