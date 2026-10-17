import {
  type MqttConnection,
  type OpenMqttConnectionOptions,
  TuyaError,
} from "@open-tuya/core";
import { connectAsync, type MqttClient } from "mqtt";

// Source: The broker's URL carries `ssl` for TLS, and the SDK connects with
// paho's defaults, MQTT 3.1.1, a clean session and a keep-alive of 60 s, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1,
// which MQTT.js's defaults match.
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

  subscribe(topic: string): void {
    if (!this.closed) {
      this.client.subscribe(topic);
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
