import { TuyaError } from "@open-tuya/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openMqttConnection } from "../connection.js";
import type { PublishedMessage } from "../packet.js";
import {
  type MqttCredentials,
  MqttSession,
  type OpenMqttConnection,
} from "../session.js";
import { until, useFakeTimers } from "./clock.js";
import { type Broker, startBroker } from "./mocks/broker.js";

interface Credentials extends MqttCredentials {
  topic: string;
}

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

interface Setup {
  broker: Broker;
  session: MqttSession<Credentials>;
  messages: [string, string][];
  /** What each connection's `onClose` was called with. */
  closes: (TuyaError | undefined)[];
  /** Makes the next fetches of credentials reject with these errors. */
  failures: unknown[];
  fetches: () => number;
}

async function setUp(expireTimeInSeconds = 7200): Promise<Setup> {
  const broker = await startBroker();
  cleanups.push(() => broker.close());
  const messages: [string, string][] = [];
  const closes: (TuyaError | undefined)[] = [];
  const failures: unknown[] = [];
  let issued = 0;
  const openConnection: OpenMqttConnection = (options) =>
    openMqttConnection({
      ...options,
      onClose: (error) => {
        closes.push(error);
        options.onClose(error);
      },
    });
  const session = new MqttSession<Credentials>(openConnection, {
    fetchCredentials: async () => {
      issued++;
      if (failures.length > 0) {
        throw failures.shift();
      }
      return {
        url: broker.url,
        clientId: `client_${issued}`,
        username: "user",
        password: `password_${issued}`,
        expireTimeInSeconds,
        topic: "devices",
      };
    },
    onMessage: (message: PublishedMessage, credentials) =>
      messages.push([`${message.payload}`, credentials.password]),
  });
  cleanups.push(() => session.close());
  return { broker, session, messages, closes, failures, fetches: () => issued };
}

describe("MqttSession", () => {
  it("subscribes to each topic once, named from the credentials", async () => {
    const { broker, session } = await setUp();

    session.subscribe((credentials) => credentials.topic);
    session.subscribe((credentials) => credentials.topic);
    session.subscribe((credentials) => `${credentials.topic}/other`);
    await until(() => broker.subscriptions.length > 1);

    expect([...broker.subscriptions].sort()).toEqual([
      "devices",
      "devices/other",
    ]);
  });

  it("hands each message on with the credentials of its connection", async () => {
    const { broker, session, messages } = await setUp();
    session.subscribe((credentials) => credentials.topic);
    await until(() => broker.subscriptions.length > 0);

    await broker.publish("devices", "hello");
    await until(() => messages.length > 0);

    expect(messages).toEqual([["hello", "password_1"]]);
  });

  it("unsubscribes a topic once nothing subscribes it, and closes with the last", async () => {
    const { broker, session, closes } = await setUp();
    const first = session.subscribe((credentials) => credentials.topic);
    const second = session.subscribe((credentials) => credentials.topic);
    const other = session.subscribe((credentials) => `${credentials.topic}/b`);
    await until(() => broker.subscriptions.length > 1);

    await first();
    await first();
    await other();
    await until(() => broker.unsubscriptions.length > 0);
    expect(broker.unsubscriptions).toEqual(["devices/b"]);
    expect(closes).toEqual([]);

    await second();

    expect(closes).toEqual([undefined]);
    expect(broker.connects).toHaveLength(1);
  });

  it("renews its credentials 60 s before they expire, before closing the old connection", async () => {
    const { broker, session, closes } = await setUp(120);
    useFakeTimers();
    session.subscribe((credentials) => credentials.topic);
    await until(() => broker.subscriptions.length > 0);

    await vi.advanceTimersByTimeAsync(60_000);
    await until(() => closes.length > 0 && broker.subscriptions.length > 1);

    expect(broker.connects.map(({ clientId }) => clientId)).toEqual([
      "client_1",
      "client_2",
    ]);
    expect(broker.subscriptions).toEqual(["devices", "devices"]);
    expect(closes).toEqual([undefined]);
  });

  it("reconnects with new credentials 5 s after a loss, doubling", async () => {
    const { broker, session, closes, failures, fetches } = await setUp();
    useFakeTimers();
    session.subscribe((credentials) => credentials.topic);
    await until(() => broker.subscriptions.length > 0);
    failures.push(new TuyaError("CONNECTION_FAILED", "Down"));

    broker.clients[0]?.close();
    await until(() => closes.length > 0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetches()).toBe(2);
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetches()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => broker.subscriptions.length > 1);

    expect(broker.connects.map(({ clientId }) => clientId)).toEqual([
      "client_1",
      "client_3",
    ]);
  });

  it("renews from the connection it reconnected, not the one it lost", async () => {
    const { broker, session, closes } = await setUp(120);
    useFakeTimers();
    session.subscribe((credentials) => credentials.topic);
    await until(() => broker.subscriptions.length > 0);

    await vi.advanceTimersByTimeAsync(30_000);
    broker.clients[0]?.close();
    await until(() => closes.length > 0);
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => broker.subscriptions.length > 1);
    await vi.advanceTimersByTimeAsync(40_000);

    expect(broker.connects).toHaveLength(2);
  });

  it.each([
    ["SESSION_EXPIRED", new TuyaError("SESSION_EXPIRED", "Scan again")],
    ["PERMISSION_DENIED", new TuyaError("PERMISSION_DENIED", "Renew")],
    ["an error that is not a TuyaError", new TypeError("Bug")],
  ])("stops trying after %s", async (_name, error) => {
    const { session, failures, fetches } = await setUp();
    useFakeTimers();
    failures.push(error);

    session.subscribe((credentials) => credentials.topic);
    await until(() => fetches() === 1);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetches()).toBe(1);
  });

  it("releases the connection on close", async () => {
    const { broker, session, closes } = await setUp();
    session.subscribe((credentials) => credentials.topic);
    await until(() => broker.subscriptions.length > 0);

    await session.close();
    await session.close();

    expect(closes).toEqual([undefined]);
  });
});
