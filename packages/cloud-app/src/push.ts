import {
  type DataPoints,
  type DataPointValue,
  TuyaError,
} from "@open-tuya/core";
import type {
  MqttConnection,
  OpenMqttConnectionOptions,
} from "./mqtt/connection.js";
import type { PublishedMessage } from "./mqtt/packet.js";
import type { PushMessage } from "./protocol/records.js";

const FIRST_RECONNECT_DELAY_IN_MS = 5000;
const MAX_RECONNECT_DELAY_IN_MS = 60_000;
const RENEW_MARGIN_IN_MS = 60_000;
// Source: A data point report is protocol 4, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
const PROTOCOL_DEVICE_REPORT = 4;

export interface PushConfig {
  url: string;
  clientId: string;
  username: string;
  password: string;
  expireTimeInSeconds: number;
  /** A device's topic, with `{devId}` in place of its ID. */
  deviceTopic: string;
}

export type OpenMqttConnection = (
  options: OpenMqttConnectionOptions,
) => Promise<MqttConnection>;

type Listener = (dataPoints: DataPoints) => void;

// Source: A pushed report carries the device's own values by data point ID on
// the device's topic with "/pen" after it, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/179e1a188950a000716c7bea74996169acf9418f
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/9a80825c4965f4fbdbd8464fe73f2c7af9f31071,
// as captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301.
// Source: The credentials expire, and a connection is opened afresh with new
// ones before they do and after a loss, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/6d400c48b9a123599bd1b96024665adf72447783.
/** An account's one MQTT connection, carrying the pushes of every device a
 * client subscribes. It connects when the first device subscribes and closes
 * when the last leaves. It renews its credentials 60 s before they expire,
 * and reconnects 5 s after a loss, doubling to 60 s. */
export class DevicePush {
  private readonly listeners = new Map<string, Set<Listener>>();
  private connection: MqttConnection | undefined;
  private config: PushConfig | undefined;
  private connecting: Promise<void> = Promise.resolve();
  private generation = 0;
  private timer: NodeJS.Timeout | undefined;
  private reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;

  constructor(
    private readonly openMqtt: OpenMqttConnection,
    private readonly fetchConfig: () => Promise<PushConfig>,
  ) {}

  /** Hands `listener` the data points the device pushes. Returns a function
   * that removes it, and resolves once the connection is released if it was
   * the last. */
  subscribe(deviceId: string, listener: Listener): () => Promise<void> {
    let listeners = this.listeners.get(deviceId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(deviceId, listeners);
      this.connection?.subscribe(this.topic(deviceId));
    }
    listeners.add(listener);
    if (this.listeners.size === 1 && listeners.size === 1) {
      this.connect();
    }
    let removed = false;
    return async () => {
      if (!removed) {
        removed = true;
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(deviceId);
          this.connection?.unsubscribe(this.topic(deviceId));
        }
        if (this.listeners.size === 0) {
          this.stop();
        }
      }
      await this.released();
    };
  }

  /** Closes the connection, and resolves once it is released. */
  async close(): Promise<void> {
    this.listeners.clear();
    this.stop();
    await this.released();
  }

  private connect(): void {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.connecting = this.open(generation);
  }

  private async open(generation: number): Promise<void> {
    let connection: MqttConnection;
    let config: PushConfig;
    try {
      config = await this.fetchConfig();
      if (generation !== this.generation) {
        return;
      }
      connection = await this.openMqtt({
        url: config.url,
        clientId: config.clientId,
        username: config.username,
        password: config.password,
        onMessage: (message) => this.receive(message),
        onClose: (error) => {
          if (error && connection === this.connection) {
            this.connection = undefined;
            this.retry(generation);
          }
        },
      });
    } catch (error) {
      // An error that is not a TuyaError fails every attempt alike, and an
      // expired session fails every request.
      if (error instanceof TuyaError && error.code !== "SESSION_EXPIRED") {
        this.retry(generation);
      }
      return;
    }
    if (generation !== this.generation) {
      await connection.close();
      return;
    }
    const previous = this.connection;
    this.config = config;
    this.connection = connection;
    for (const deviceId of this.listeners.keys()) {
      connection.subscribe(this.topic(deviceId));
    }
    this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
    this.timer = setTimeout(
      () => this.connect(),
      config.expireTimeInSeconds * 1000 - RENEW_MARGIN_IN_MS,
    );
    await previous?.close();
  }

  private retry(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), this.reconnectDelayInMs);
    this.reconnectDelayInMs = Math.min(
      this.reconnectDelayInMs * 2,
      MAX_RECONNECT_DELAY_IN_MS,
    );
  }

  private stop(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
    const connection = this.connection;
    this.connection = undefined;
    this.connecting = Promise.all([this.connecting, connection?.close()]).then(
      () => {},
    );
  }

  private released(): Promise<void> {
    return this.connecting;
  }

  private topic(deviceId: string): string {
    return `${this.config?.deviceTopic.replace("{devId}", deviceId)}/pen`;
  }

  private receive({ payload }: PublishedMessage): void {
    let message: PushMessage;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      return;
    }
    const listeners = this.listeners.get(message.data?.devId ?? "");
    if (message.protocol !== PROTOCOL_DEVICE_REPORT || !listeners) {
      return;
    }
    const dataPoints: Record<string, DataPointValue> = {};
    for (const { dpId, value } of message.data?.status ?? []) {
      if (dpId !== undefined && isDataPointValue(value)) {
        dataPoints[String(dpId)] = value;
      }
    }
    if (Object.keys(dataPoints).length === 0) {
      return;
    }
    for (const listener of listeners) {
      listener(dataPoints);
    }
  }
}

export function isDataPointValue(value: unknown): value is DataPointValue {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}
