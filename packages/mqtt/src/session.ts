import { TuyaError } from "@open-tuya/core";
import type {
  MqttConnection,
  OpenMqttConnectionOptions,
} from "./connection.js";
import type { PublishedMessage } from "./packet.js";

const FIRST_RECONNECT_DELAY_IN_MS = 5000;
const MAX_RECONNECT_DELAY_IN_MS = 60_000;
const RENEW_MARGIN_IN_MS = 60_000;

/** What a cloud hands out to connect to its broker. */
export interface MqttCredentials {
  url: string;
  clientId: string;
  username: string;
  password: string;
  /** How long the credentials last. */
  expireTimeInSeconds: number;
}

export type OpenMqttConnection = (
  options: OpenMqttConnectionOptions,
) => Promise<MqttConnection>;

export interface MqttSessionOptions<C extends MqttCredentials> {
  fetchCredentials: () => Promise<C>;
  /** Called with each message, and the credentials of the connection it
   * came by. */
  onMessage: (message: PublishedMessage, credentials: C) => void;
}

interface Subscription<C> {
  topicOf: (credentials: C) => string;
}

// Source: The credentials expire, and a connection is opened afresh with new
// ones before they do and after a loss, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/6d400c48b9a123599bd1b96024665adf72447783
// and https://github.com/tuya/tuya-iot-python-sdk/blob/20a7c92898fdd44e559667bbf8f2bf6fdb1e9185/tuya_iot/openmq.py#L164-L165.
/** One MQTT connection to a cloud's broker, kept open while anything
 * subscribes. It connects with the first subscription and closes with the
 * last. It renews its credentials 60 s before they expire, opening the new
 * connection before closing the old, and reconnects with fresh ones 5 s after
 * a loss, doubling to 60 s. It stops trying after an error that is not a
 * `TuyaError`, or one with code `SESSION_EXPIRED` or `PERMISSION_DENIED`,
 * none of which clears by waiting. */
export class MqttSession<C extends MqttCredentials> {
  private readonly subscriptions = new Set<Subscription<C>>();
  private connection: MqttConnection | undefined;
  private credentials: C | undefined;
  private connecting: Promise<void> = Promise.resolve();
  private generation = 0;
  private timer: NodeJS.Timeout | undefined;
  private reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;

  constructor(
    private readonly openConnection: OpenMqttConnection,
    private readonly options: MqttSessionOptions<C>,
  ) {}

  /** Subscribes, on each connection, to the topic `topicOf` names from its
   * credentials. Returns a function that removes the subscription, and
   * resolves once the connection is released if it was the last. */
  subscribe(topicOf: (credentials: C) => string): () => Promise<void> {
    const subscription: Subscription<C> = { topicOf };
    const topic = this.topic(subscription);
    if (topic !== undefined && !this.topics().has(topic)) {
      this.connection?.subscribe(topic);
    }
    this.subscriptions.add(subscription);
    if (this.subscriptions.size === 1) {
      this.connect();
    }
    let removing: Promise<void> | undefined;
    return () => {
      removing ??= this.unsubscribe(subscription);
      return removing;
    };
  }

  /** Closes the connection, and resolves once it is released. */
  async close(): Promise<void> {
    this.subscriptions.clear();
    this.stop();
    await this.connecting;
  }

  private async unsubscribe(subscription: Subscription<C>): Promise<void> {
    this.subscriptions.delete(subscription);
    const topic = this.topic(subscription);
    if (topic !== undefined && !this.topics().has(topic)) {
      this.connection?.unsubscribe(topic);
    }
    if (this.subscriptions.size === 0) {
      this.stop();
      await this.connecting;
    }
  }

  private connect(): void {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.connecting = this.open(generation);
  }

  private async open(generation: number): Promise<void> {
    let connection: MqttConnection;
    let credentials: C;
    try {
      credentials = await this.options.fetchCredentials();
      if (generation !== this.generation) {
        return;
      }
      connection = await this.openConnection({
        url: credentials.url,
        clientId: credentials.clientId,
        username: credentials.username,
        password: credentials.password,
        onMessage: (message) => this.options.onMessage(message, credentials),
        onClose: (error) => {
          if (error && connection === this.connection) {
            this.connection = undefined;
            this.retry(generation);
          }
        },
      });
    } catch (error) {
      if (
        error instanceof TuyaError &&
        error.code !== "SESSION_EXPIRED" &&
        error.code !== "PERMISSION_DENIED"
      ) {
        this.retry(generation);
      }
      return;
    }
    if (generation !== this.generation) {
      await connection.close();
      return;
    }
    const previous = this.connection;
    this.credentials = credentials;
    this.connection = connection;
    for (const topic of this.topics()) {
      connection.subscribe(topic);
    }
    this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
    this.timer = setTimeout(
      () => this.connect(),
      credentials.expireTimeInSeconds * 1000 - RENEW_MARGIN_IN_MS,
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

  private topic(subscription: Subscription<C>): string | undefined {
    return this.credentials && subscription.topicOf(this.credentials);
  }

  private topics(): Set<string> {
    const topics = new Set<string>();
    for (const subscription of this.subscriptions) {
      const topic = this.topic(subscription);
      if (topic !== undefined) {
        topics.add(topic);
      }
    }
    return topics;
  }
}
