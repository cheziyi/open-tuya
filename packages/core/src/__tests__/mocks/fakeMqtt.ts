import { TuyaError } from "../../error.js";
import type {
  MqttConnection,
  OpenMqttConnection,
  OpenMqttConnectionOptions,
} from "../../mqttSession.js";

/** A connection that records what the session asks of it. */
export class FakeMqttConnection implements MqttConnection {
  readonly topics = new Set<string>();
  readonly unsubscribed: string[] = [];
  closed = false;

  constructor(readonly options: OpenMqttConnectionOptions) {}

  subscribe(topic: string): void {
    if (!this.closed) {
      this.topics.add(topic);
    }
  }

  unsubscribe(topic: string): void {
    if (!this.closed) {
      this.topics.delete(topic);
      this.unsubscribed.push(topic);
    }
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.options.onClose();
    }
  }

  /** Delivers a message, as the broker would. */
  deliver(topic: string, payload: string): void {
    this.options.onMessage({
      topic,
      payload: new TextEncoder().encode(payload),
    });
  }

  /** Loses the connection, as a dropped socket would. */
  drop(): void {
    this.closed = true;
    this.options.onClose(new TuyaError("CONNECTION_LOST", "Dropped"));
  }
}

/** An `OpenMqttConnection` that opens fake connections, or rejects with the
 * next of `failures`. */
export function fakeOpenMqttConnection(): {
  open: OpenMqttConnection;
  connections: FakeMqttConnection[];
  failures: unknown[];
} {
  const connections: FakeMqttConnection[] = [];
  const failures: unknown[] = [];
  const open: OpenMqttConnection = async (options) => {
    if (failures.length > 0) {
      throw failures.shift();
    }
    const connection = new FakeMqttConnection(options);
    connections.push(connection);
    return connection;
  };
  return { open, connections, failures };
}
