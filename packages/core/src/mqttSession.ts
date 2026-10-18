import { TuyaError } from "./error.js";

const FIRST_RECONNECT_DELAY_IN_MS = 5000;
const MAX_RECONNECT_DELAY_IN_MS = 60_000;
const RENEW_MARGIN_IN_MS = 60_000;
// Credentials that last a minute or less, or that say nothing of how long,
// would otherwise be renewed at once and without end. Once a minute is as
// often as the reconnect backoff fetches new ones at its longest.
const MIN_RENEW_DELAY_IN_MS = 60_000;
// setTimeout fires at once when given a longer delay. Renewing early costs one
// request, as the credentials still hold.
const MAX_TIMER_DELAY_IN_MS = 2 ** 31 - 1;

/** What a cloud hands out to connect to its broker. */
export interface MqttCredentials {
  url: string;
  clientId: string;
  username: string;
  password: string;
  /** How long the credentials last. */
  expireTimeInSeconds: number;
}

export interface MqttMessage {
  topic: string;
  payload: Uint8Array;
}

/** An open connection to a broker, as an `OpenMqttConnection` opens it. */
export interface MqttConnection {
  /** Subscribes at QoS 0. Does nothing once closed. */
  subscribe(topic: string): void;
  /** Does nothing once closed. */
  unsubscribe(topic: string): void;
  /** Calls `onClose` with no error, and resolves once the connection is
   * released. */
  close(): Promise<void>;
}

export interface OpenMqttConnectionOptions {
  url: string;
  clientId: string;
  username: string;
  password: string;
  onMessage: (message: MqttMessage) => void;
  /** Called once when the connection closes, with no error after `close`.
   * Never called when the open rejects. */
  onClose: (error?: TuyaError) => void;
}

/** Opens a connection to a broker, rejecting with a `TuyaError` with code
 * `CONNECTION_FAILED` when the broker does not accept it. */
export type OpenMqttConnection = (
  options: OpenMqttConnectionOptions,
) => Promise<MqttConnection>;

export interface MqttSessionOptions<C extends MqttCredentials> {
  fetchCredentials: () => Promise<C>;
  /** Called with each message, and the credentials of the connection it
   * came by. */
  onMessage: (message: MqttMessage, credentials: C) => void;
}

interface Subscription<C> {
  topicOf: (credentials: C) => string;
}

// Source: The credentials expire, and a connection is opened afresh with new
// ones before they do and after a loss, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/6d400c48b9a123599bd1b96024665adf72447783
// and https://github.com/tuya/tuya-iot-python-sdk/blob/20a7c92898fdd44e559667bbf8f2bf6fdb1e9185/tuya_iot/openmq.py#L164-L165.
// Source: The wait after a loss keeps growing until a connection lasts to its
// renewal, as each attempt fetches fresh credentials, in
// https://github.com/tuya/tuya-device-sharing-sdk/blob/6d400c48b9a123599bd1b96024665adf72447783/tuya_sharing/mq.py#L149-L162.
/** One connection to a cloud's broker, kept open while anything subscribes.
 * It connects with the first subscription and closes with the last. It renews
 * its credentials 60 s before they expire, but no sooner than 60 s after it
 * connected, opening the new connection before closing the old. After a loss
 * it reconnects with fresh credentials 5 s later, doubling to 60 s, and the
 * wait drops back to 5 s only once a connection lasts until its renewal. It
 * stops trying after an error that is not a `TuyaError`, or one with code
 * `SESSION_EXPIRED` or `PERMISSION_DENIED`, none of which clears by waiting.
 *
 * While it renews, both connections are subscribed for a moment, so a message
 * the broker sends then can arrive twice. */
export class MqttSession<C extends MqttCredentials> {
  private readonly subscriptions = new Set<Subscription<C>>();
  private connection: MqttConnection | undefined;
  private credentials: C | undefined;
  // Each open and close still running, which `stop` waits for.
  private readonly pending = new Set<Promise<void>>();
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
  private closed = false;

  constructor(
    private readonly openConnection: OpenMqttConnection,
    private readonly options: MqttSessionOptions<C>,
  ) {}

  /** Subscribes, on each connection, to the topic `topicOf` names from its
   * credentials. Returns a function that removes the subscription, and
   * resolves once the connection is released if it was the last. Once the
   * session is closed, it subscribes nothing and connects nothing. */
  subscribe(topicOf: (credentials: C) => string): () => Promise<void> {
    if (this.closed) {
      return async () => {};
    }
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

  /** Closes the connection for good, and resolves once every connection the
   * session opened is released. */
  async close(): Promise<void> {
    this.closed = true;
    this.subscriptions.clear();
    await this.stop();
  }

  private async unsubscribe(subscription: Subscription<C>): Promise<void> {
    this.subscriptions.delete(subscription);
    const topic = this.topic(subscription);
    if (topic !== undefined && !this.topics().has(topic)) {
      this.connection?.unsubscribe(topic);
    }
    if (this.subscriptions.size === 0) {
      await this.stop();
    }
  }

  private connect(): void {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.track(this.open(generation));
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
    this.timer = setTimeout(() => {
      this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
      this.connect();
    }, renewDelayInMs(credentials.expireTimeInSeconds));
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

  // Resolves once each open and close begun so far settles, but waits for
  // none begun later: a subscription made meanwhile does not hold up the
  // removal of the one before.
  private stop(): Promise<void> {
    this.generation++;
    clearTimeout(this.timer);
    this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
    if (this.connection) {
      this.track(this.connection.close());
      this.connection = undefined;
    }
    return Promise.all(this.pending).then(() => {});
  }

  private track(work: Promise<void>): void {
    this.pending.add(work);
    const settle = () => this.pending.delete(work);
    work.then(settle, settle);
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

function renewDelayInMs(expireTimeInSeconds: number): number {
  const delayInMs = expireTimeInSeconds * 1000 - RENEW_MARGIN_IN_MS;
  if (Number.isNaN(delayInMs)) {
    return MIN_RENEW_DELAY_IN_MS;
  }
  return Math.min(
    Math.max(delayInMs, MIN_RENEW_DELAY_IN_MS),
    MAX_TIMER_DELAY_IN_MS,
  );
}
