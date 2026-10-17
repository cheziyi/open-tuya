import { afterEach, describe, expect, it, vi } from "vitest";
import { TuyaError } from "../error.js";
import { type MqttCredentials, MqttSession } from "../mqttSession.js";
import { fakeOpenMqttConnection } from "./mocks/fakeMqtt.js";

interface Credentials extends MqttCredentials {
  topic: string;
}

const sessions: MqttSession<Credentials>[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.close();
  }
  vi.useRealTimers();
});

function setUp(expireTimeInSeconds = 7200) {
  const mqtt = fakeOpenMqttConnection();
  const messages: [string, string][] = [];
  const fetchFailures: unknown[] = [];
  let fetches = 0;
  const session = new MqttSession<Credentials>(mqtt.open, {
    fetchCredentials: async () => {
      fetches++;
      if (fetchFailures.length > 0) {
        throw fetchFailures.shift();
      }
      return {
        url: "ssl://broker:8883",
        clientId: `client_${fetches}`,
        username: "user",
        password: `password_${fetches}`,
        expireTimeInSeconds,
        topic: "devices",
      };
    },
    onMessage: (message, credentials) =>
      messages.push([
        new TextDecoder().decode(message.payload),
        credentials.password,
      ]),
  });
  sessions.push(session);
  return { session, messages, fetchFailures, fetches: () => fetches, ...mqtt };
}

describe("MqttSession", () => {
  it("connects with the first subscription, with the credentials it fetched", async () => {
    const { session, connections } = setUp();

    session.subscribe((credentials) => credentials.topic);
    await vi.waitFor(() => expect(connections).toHaveLength(1));

    expect(connections[0]?.options).toMatchObject({
      url: "ssl://broker:8883",
      clientId: "client_1",
      username: "user",
      password: "password_1",
    });
    expect([...(connections[0]?.topics ?? [])]).toEqual(["devices"]);
  });

  it("subscribes to each topic once, named from the credentials", async () => {
    const { session, connections } = setUp();

    session.subscribe((credentials) => credentials.topic);
    await vi.waitFor(() => expect(connections).toHaveLength(1));
    session.subscribe((credentials) => credentials.topic);
    session.subscribe((credentials) => `${credentials.topic}/other`);

    expect([...(connections[0]?.topics ?? [])]).toEqual([
      "devices",
      "devices/other",
    ]);
  });

  it("hands each message on with the credentials of its connection", async () => {
    const { session, connections, messages } = setUp();
    session.subscribe((credentials) => credentials.topic);
    await vi.waitFor(() => expect(connections).toHaveLength(1));

    connections[0]?.deliver("devices", "hello");

    expect(messages).toEqual([["hello", "password_1"]]);
  });

  it("unsubscribes a topic once nothing subscribes it, and closes with the last", async () => {
    const { session, connections } = setUp();
    const first = session.subscribe((credentials) => credentials.topic);
    const second = session.subscribe((credentials) => credentials.topic);
    const other = session.subscribe((credentials) => `${credentials.topic}/b`);
    await vi.waitFor(() => expect(connections).toHaveLength(1));

    await first();
    await first();
    await other();
    expect(connections[0]?.unsubscribed).toEqual(["devices/b"]);
    expect(connections[0]?.closed).toBe(false);

    await second();

    expect(connections[0]?.closed).toBe(true);
    expect(connections).toHaveLength(1);
  });

  it("renews its credentials 60 s before they expire, before closing the old connection", async () => {
    vi.useFakeTimers();
    const { session, connections } = setUp(120);
    session.subscribe((credentials) => credentials.topic);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(connections).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(connections.map(({ options }) => options.clientId)).toEqual([
      "client_1",
      "client_2",
    ]);
    expect([...(connections[1]?.topics ?? [])]).toEqual(["devices"]);
    expect(connections[0]?.closed).toBe(true);
  });

  it("reconnects with new credentials 5 s after a loss, doubling", async () => {
    vi.useFakeTimers();
    const { session, connections, failures, fetches } = setUp();
    session.subscribe((credentials) => credentials.topic);
    await vi.advanceTimersByTimeAsync(0);
    failures.push(new TuyaError("CONNECTION_FAILED", "Down"));

    connections[0]?.drop();
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetches()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetches()).toBe(2);
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetches()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);

    expect(connections.map(({ options }) => options.clientId)).toEqual([
      "client_1",
      "client_3",
    ]);
  });

  it("renews from the connection it reconnected, not the one it lost", async () => {
    vi.useFakeTimers();
    const { session, connections } = setUp(120);
    session.subscribe((credentials) => credentials.topic);
    await vi.advanceTimersByTimeAsync(30_000);

    connections[0]?.drop();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(40_000);

    expect(connections).toHaveLength(2);
  });

  it.each([
    ["SESSION_EXPIRED", new TuyaError("SESSION_EXPIRED", "Scan again")],
    ["PERMISSION_DENIED", new TuyaError("PERMISSION_DENIED", "Renew")],
    ["an error that is not a TuyaError", new TypeError("Bug")],
  ])("stops trying after %s", async (_name, error) => {
    vi.useFakeTimers();
    const { session, fetchFailures, fetches } = setUp();
    fetchFailures.push(error);

    session.subscribe((credentials) => credentials.topic);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetches()).toBe(1);
  });

  it("releases the connection on close", async () => {
    const { session, connections } = setUp();
    session.subscribe((credentials) => credentials.topic);
    await vi.waitFor(() => expect(connections).toHaveLength(1));

    await session.close();
    await session.close();

    expect(connections[0]?.closed).toBe(true);
  });
});
