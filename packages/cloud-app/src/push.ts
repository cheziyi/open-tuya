import type {
  DataPoints,
  MqttCredentials,
  MqttMessage,
  MqttSession,
} from "@open-tuya/core";
import { readPush } from "./protocol/records.js";

export interface PushConfig extends MqttCredentials {
  /** A device's topic, with `{devId}` in place of its ID. */
  deviceTopic: string;
}

type Listener = (dataPoints: DataPoints) => void;

// Source: A pushed report comes on the device's topic with "/pen" after it, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/6877c7fc0350ec5bdbe958f0c84861bd3749abd4,
// and carries the device's own values by data point ID, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13,
// as captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301.
/** Hands each device's pushed data points to its listeners, subscribing a
 * device's topic while it has one, and each push that a device went online
 * or offline to `onOnline`. */
export class DevicePush {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly removals = new Map<string, () => Promise<void>>();

  constructor(
    private readonly session: MqttSession<PushConfig>,
    private readonly onOnline: (deviceId: string, online: boolean) => void,
  ) {}

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

  /** Never throws: it runs inside MQTT.js's handler of the packet. */
  receive({ payload }: MqttMessage): void {
    const push = readPush(payload);
    if (!push) {
      return;
    }
    if ("online" in push) {
      this.onOnline(push.devId, push.online);
      return;
    }
    const listeners = this.listeners.get(push.devId);
    if (!listeners || Object.keys(push.dataPoints).length === 0) {
      return;
    }
    for (const listener of listeners) {
      reportTo(listener, push.dataPoints);
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

/** Calls `listener`, and rethrows what it throws once the caller's turn is
 * over, as Node's `EventTarget` does: the other listeners still run, and the
 * error never reaches MQTT.js. */
export function reportTo(listener: Listener, dataPoints: DataPoints): void {
  try {
    listener(dataPoints);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}
