import {
  type MqttConnection,
  type OpenMqttConnectionOptions,
  TuyaError,
} from "@open-tuya/core";
import { connectAsync, type MqttClient } from "mqtt";

// Source: The broker's URL carries `ssl` for TLS, and the clients connect
// with MQTT.js's defaults, in
// https://github.com/tuya/tuya-homebridge/commit/b530a71ae78afc9672c2ce42345749d38605f31c,
// and with paho's, the same, in
// https://github.com/tuya/tuya-iot-python-sdk/commit/a7856ac4c05cf6ff15251ce87c8a48222bc28e07.
/** Opens a connection to the cloud's broker with MQTT.js. It rejects with a
 * `TuyaError` with code `CONNECTION_FAILED` when the broker does not accept
 * it. */
export async function openMqttConnection(
  options: OpenMqttConnectionOptions,
): Promise<MqttConnection> {
  let client: MqttClient;
  try {
    client = await connectAsync(
      options.url,
      {
        clientId: options.clientId,
        username: options.username,
        password: options.password,
        // MQTT.js would reconnect with a client ID gone stale once renewed:
        // MqttSession reconnects with fresh credentials instead.
        reconnectPeriod: 0,
      },
      false,
    );
  } catch (error) {
    throw new TuyaError("CONNECTION_FAILED", "No MQTT connection opened", {
      cause: error,
    });
  }
  return new MqttJsConnection(client, options);
}

class MqttJsConnection implements MqttConnection {
  private closed = false;
  private lastError: Error | undefined;

  constructor(
    private readonly client: MqttClient,
    private readonly options: OpenMqttConnectionOptions,
  ) {
    client.on("message", (topic, payload) => {
      if (!this.closed) {
        options.onMessage({ topic, payload });
      }
    });
    client.on("error", (error) => {
      this.lastError = error;
    });
    client.on("close", () => {
      if (!this.closed) {
        this.closed = true;
        options.onClose(
          new TuyaError("CONNECTION_LOST", "The MQTT connection closed", {
            cause: this.lastError,
          }),
        );
      }
    });
  }

  /** A subscription the broker refuses closes the connection with
   * `CONNECTION_LOST`, its refusal as the cause, so the session connects
   * again with fresh credentials. */
  subscribe(topic: string): void {
    if (!this.closed) {
      this.client.subscribe(topic, (error) => {
        if (error && !this.closed) {
          this.lastError = error;
          this.client.end();
        }
      });
    }
  }

  unsubscribe(topic: string): void {
    if (!this.closed) {
      this.client.unsubscribe(topic);
    }
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.options.onClose();
    }
    await this.client.endAsync();
  }
}
