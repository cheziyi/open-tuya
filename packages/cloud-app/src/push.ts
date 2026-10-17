import type { DataPoints, DataPointValue } from "@open-tuya/core";
import type {
  MqttCredentials,
  MqttSession,
  PublishedMessage,
} from "@open-tuya/mqtt";
import type { PushMessage } from "./protocol/records.js";

// Source: A data point report is protocol 4, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
const PROTOCOL_DEVICE_REPORT = 4;

export interface PushConfig extends MqttCredentials {
  /** A device's topic, with `{devId}` in place of its ID. */
  deviceTopic: string;
}

type Listener = (dataPoints: DataPoints) => void;

// Source: A pushed report carries the device's own values by data point ID on
// the device's topic with "/pen" after it, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/179e1a188950a000716c7bea74996169acf9418f
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/9a80825c4965f4fbdbd8464fe73f2c7af9f31071,
// as captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301.
/** Hands each device's pushed data points to its listeners, subscribing a
 * device's topic while it has one. */
export class DevicePush {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly removals = new Map<string, () => Promise<void>>();

  constructor(private readonly session: MqttSession<PushConfig>) {}

  /** Returns a function that removes `listener`, and resolves once the
   * connection is released if it was the last. */
  subscribe(deviceId: string, listener: Listener): () => Promise<void> {
    let listeners = this.listeners.get(deviceId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(deviceId, listeners);
      this.removals.set(
        deviceId,
        this.session.subscribe(
          (config) => `${config.deviceTopic.replace("{devId}", deviceId)}/pen`,
        ),
      );
    }
    const deviceListeners = listeners;
    deviceListeners.add(listener);
    let removing: Promise<void> | undefined;
    return () => {
      removing ??= this.remove(deviceId, deviceListeners, listener);
      return removing;
    };
  }

  receive({ payload }: PublishedMessage): void {
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

  private async remove(
    deviceId: string,
    listeners: Set<Listener>,
    listener: Listener,
  ): Promise<void> {
    listeners.delete(listener);
    if (listeners.size > 0) {
      return;
    }
    this.listeners.delete(deviceId);
    const remove = this.removals.get(deviceId);
    this.removals.delete(deviceId);
    await remove?.();
  }
}

export function isDataPointValue(value: unknown): value is DataPointValue {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}
