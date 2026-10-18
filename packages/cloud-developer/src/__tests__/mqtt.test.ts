import type { MqttConnection, MqttMessage, TuyaError } from "@open-tuya/core";
import { afterEach, describe, expect, it } from "vitest";
import { openMqttConnection } from "../mqtt.js";
import { until } from "./clock.js";
import { type Broker, startBroker } from "./mocks/broker.js";

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function broker(password?: string): Promise<Broker> {
  const started = await startBroker(password ? { password } : {});
  cleanups.push(() => started.close());
  return started;
}

async function open(url: string, password = "secret") {
  const messages: MqttMessage[] = [];
  const closes: (TuyaError | undefined)[] = [];
  const connection: MqttConnection = await openMqttConnection({
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

    connection.subscribe("devices");
    await until(() => started.subscriptions.length > 0);
    await started.publish("devices", "hello");
    await until(() => messages.length > 0);

    expect(
      messages.map(({ topic, payload }) => [
        topic,
        new TextDecoder().decode(payload),
      ]),
    ).toEqual([["devices", "hello"]]);
  });

  it("rejects with CONNECTION_FAILED when the broker refuses the credentials", async () => {
    const started = await broker("secret");

    await expect(open(started.url, "wrong")).rejects.toMatchObject({
      code: "CONNECTION_FAILED",
    });
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

  it("closes with CONNECTION_LOST when the broker refuses a subscription", async () => {
    const started = await startBroker({ refuseSubscriptions: true });
    cleanups.push(() => started.close());
    const { connection, closes } = await open(started.url);

    connection.subscribe("devices");
    await until(() => closes.length > 0);

    expect(closes).toEqual([
      expect.objectContaining({ code: "CONNECTION_LOST" }),
    ]);
  });

  it("closes once with no error, and disconnects from the broker", async () => {
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
