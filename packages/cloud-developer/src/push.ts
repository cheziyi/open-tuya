import {
  type DataPoints,
  type DataPointValue,
  isDataPointValue,
  type MqttCredentials,
  type MqttMessage,
  type MqttSession,
} from "@open-tuya/core";
import { decryptPushData } from "./protocol/message.js";
import type { PushData, PushEnvelope } from "./protocol/records.js";

// Source: A data point report is protocol 4, in
// https://github.com/tuya/tuya-iot-python-sdk/commit/927f095469a5acf09ff1c55f90f22fa8ad8ae5b1,
// and some firmwares send it with no protocol, in
// https://github.com/adrianjagielak/homebridge-tuya-plus/commit/0c5cc665272c9510ad7bc382aafda3ee4ea26017.
// DESIGN.md#cloud-developer-push says why a message without one is read.
const PROTOCOL_DEVICE_REPORT = 4;
// Source: A protocol 20 push says what happened to a device by `bizCode`, and
// to which by `devId`, both in its sealed `data`: "online" and "offline" are
// two of its codes, in
// https://github.com/tuya/tuya-iot-python-sdk/commit/927f095469a5acf09ff1c55f90f22fa8ad8ae5b1.
const PROTOCOL_OTHER = 20;
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
 * project's topic while any device has one, and each push that a device went
 * online or offline to `onOnline`. */
export class DevicePush {
  private readonly listeners = new Map<string, Set<Listener>>();
  private unsubscribe: (() => Promise<void>) | undefined;

  constructor(
    private readonly session: MqttSession<PushConfig>,
    private readonly onOnline: (deviceId: string, online: boolean) => void,
  ) {}

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

  receive({ payload }: MqttMessage, config: PushConfig): void {
    let envelope: PushEnvelope;
    let data: PushData | null;
    try {
      envelope = JSON.parse(new TextDecoder().decode(payload));
      if (
        (envelope.protocol != null &&
          envelope.protocol !== PROTOCOL_DEVICE_REPORT &&
          envelope.protocol !== PROTOCOL_OTHER) ||
        !envelope.data
      ) {
        return;
      }
      data = JSON.parse(
        decryptPushData(envelope.data, config.password, envelope.t ?? 0),
      );
    } catch {
      return;
    }
    if (envelope.protocol === PROTOCOL_OTHER) {
      const online = data?.bizCode === "online";
      if ((online || data?.bizCode === "offline") && data?.devId) {
        this.onOnline(data.devId, online);
      }
      return;
    }
    const listeners = this.listeners.get(data?.devId ?? "");
    if (!listeners) {
      return;
    }
    const dataPoints: Record<string, DataPointValue> = {};
    const status = data?.status;
    for (const entry of Array.isArray(status) ? status : []) {
      for (const [key, value] of Object.entries(entry ?? {})) {
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
