import type { DataPoints, DataPointValue } from "@open-tuya/core";
import type {
  MqttCredentials,
  MqttSession,
  PublishedMessage,
} from "@open-tuya/mqtt";
import { decryptPushData } from "./protocol/message.js";
import type { PushData, PushEnvelope } from "./protocol/records.js";

// Source: A data point report is protocol 4, in
// https://github.com/tuya/tuya-iot-python-sdk/commit/927f095469a5acf09ff1c55f90f22fa8ad8ae5b1.
const PROTOCOL_DEVICE_REPORT = 4;
const DATA_POINT_ID = /^\d+$/;

export interface PushConfig extends MqttCredentials {
  /** The one topic every device of the project is pushed on. */
  deviceTopic: string;
}

type Listener = (dataPoints: DataPoints) => void;

// Source: Every device's reports arrive on the topic `source_topic.device`
// names, in
// https://github.com/tuya/tuya-homebridge/commit/b530a71ae78afc9672c2ce42345749d38605f31c
// and https://github.com/adrianjagielak/homebridge-tuya-plus/commit/0c5cc665272c9510ad7bc382aafda3ee4ea26017.
// Source: Each status entry carries the device's own value under its data
// point ID, as captured in https://github.com/tuya/tuya-home-assistant/issues/591
// and https://github.com/tuya/tuya-homebridge/issues/352.
/** Hands each device's pushed data points to its listeners, subscribing the
 * project's topic while any device has one. */
export class DevicePush {
  private readonly listeners = new Map<string, Set<Listener>>();
  private unsubscribe: (() => Promise<void>) | undefined;

  constructor(private readonly session: MqttSession<PushConfig>) {}

  /** Returns a function that removes `listener`, and resolves once the
   * connection is released if it was the last. */
  subscribe(deviceId: string, listener: Listener): () => Promise<void> {
    this.unsubscribe ??= this.session.subscribe((config) => config.deviceTopic);
    let listeners = this.listeners.get(deviceId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(deviceId, listeners);
    }
    const deviceListeners = listeners;
    deviceListeners.add(listener);
    let removing: Promise<void> | undefined;
    return () => {
      removing ??= this.remove(deviceId, deviceListeners, listener);
      return removing;
    };
  }

  receive({ payload }: PublishedMessage, config: PushConfig): void {
    let data: PushData;
    try {
      const envelope: PushEnvelope = JSON.parse(payload.toString());
      if (envelope.protocol !== PROTOCOL_DEVICE_REPORT || !envelope.data) {
        return;
      }
      data = JSON.parse(
        decryptPushData(envelope.data, config.password, envelope.t ?? 0),
      );
    } catch {
      return;
    }
    const listeners = this.listeners.get(data.devId ?? "");
    if (!listeners) {
      return;
    }
    const dataPoints: Record<string, DataPointValue> = {};
    for (const entry of data.status ?? []) {
      for (const [key, value] of Object.entries(entry)) {
        if (DATA_POINT_ID.test(key) && isDataPointValue(value)) {
          dataPoints[key] = value;
        }
      }
    }
    if (Object.keys(dataPoints).length === 0) {
      return;
    }
    for (const listener of listeners) {
      listener(dataPoints);
    }
  }

  private async remove(
    deviceId: string,
    listeners: Set<Listener>,
    listener: Listener,
  ): Promise<void> {
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(deviceId);
    }
    if (this.listeners.size === 0) {
      const unsubscribe = this.unsubscribe;
      this.unsubscribe = undefined;
      await unsubscribe?.();
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
