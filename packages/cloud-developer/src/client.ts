import {
  type DataPoints,
  type DataPointValue,
  isDataPointValue,
  type TuyaClient,
  TuyaError,
} from "@open-tuya/core";
import type { ShadowProperties } from "./protocol/records.js";

export interface RequestParts {
  query?: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
}

/** What a client reaches the cloud through: its account. */
export interface DeveloperCloudTransport {
  request(method: string, path: string, parts?: RequestParts): Promise<unknown>;
  /** Hands `listener` the data points the device pushes. Returns a function
   * that removes it, and resolves once what it held is released. */
  subscribe(listener: (dataPoints: DataPoints) => void): () => Promise<void>;
}

// Source: The thing shadow holds each data point's ID beside its code, with
// the device's own value, in
// https://github.com/tuya/tuya-connector/commit/25424c594135e8c5f4c684a0b7cce8fc7b4fcca6,
// https://github.com/adrianjagielak/homebridge-tuya-plus/commit/d7bb418646dfda361e67a61cbc76debacb0a8b10
// and https://github.com/xZetsubou/hass-localtuya/commit/17a99789947de7fe44ca593b6d424863ef2c8f44,
// and as captured in https://github.com/jasonacox/tinytuya/issues/391 and
// https://github.com/xZetsubou/hass-localtuya/issues/782#issuecomment-3958114610.
// Source: Properties are issued to /shadow/properties/issue by the thing
// model's code, as an object, in
// https://github.com/tuya/tuya-connector/commit/25424c594135e8c5f4c684a0b7cce8fc7b4fcca6.
// DESIGN.md#cloud-developer-data-points says why not as JSON text.
// Source: An issued value is in the thing model's own terms, an integer
// before its scale, in
// https://github.com/tuya/tuya-openclaw-skills/commit/79292c594cfba383555b4f465e835132136f0ea6.
/** A device reached through the Tuya developer platform. Create one with
 * `DeveloperCloudAccount.createClient`. It reads and writes the device's data
 * points through its thing model, by ID with the device's own values, and
 * hands its listeners the data points the cloud pushes. It subscribes to the
 * account's pushes with its first listener, and unsubscribes with its last. */
export class DeveloperCloudTuyaClient implements TuyaClient {
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  private unsubscribe: (() => Promise<void>) | undefined;
  private unsubscribing: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly transport: DeveloperCloudTransport,
    private readonly deviceId: string,
    private readonly codes: ReadonlyMap<string, string>,
  ) {}

  get connected(): boolean {
    return !this.closed;
  }

  async readDataPoints(): Promise<DataPoints> {
    const shadow = (await this.request(
      "GET",
      `/v2.0/cloud/thing/${encodeURIComponent(this.deviceId)}/shadow/properties`,
      {},
    )) as ShadowProperties | null;
    const dataPoints: Record<string, DataPointValue> = {};
    const properties = shadow?.properties;
    for (const property of Array.isArray(properties) ? properties : []) {
      if (property?.dp_id != null && isDataPointValue(property.value)) {
        dataPoints[String(property.dp_id)] = property.value;
      }
    }
    return dataPoints;
  }

  /** It resolves once the cloud takes the write. It rejects with a
   * `TuyaError` with code `UNMAPPED_DATA_POINT`, sending nothing, when a
   * data point is not in the device's thing model. */
  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    const properties: Record<string, DataPointValue> = {};
    for (const [id, value] of Object.entries(dataPoints)) {
      const code = this.codes.get(id);
      if (code === undefined) {
        throw new TuyaError(
          "UNMAPPED_DATA_POINT",
          `Data point ${id} is not in the thing model of device ${this.deviceId}`,
        );
      }
      properties[code] = value;
    }
    await this.request(
      "POST",
      `/v2.0/cloud/thing/${encodeURIComponent(this.deviceId)}/shadow/properties/issue`,
      { body: { properties } },
    );
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    if (!this.closed) {
      this.unsubscribe ??= this.transport.subscribe((dataPoints) =>
        this.report(dataPoints),
      );
    }
    return () => {
      if (this.listeners.delete(listener) && this.listeners.size === 0) {
        this.release();
      }
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listeners.clear();
    this.release();
    await this.unsubscribing;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private request(
    method: string,
    path: string,
    parts: RequestParts,
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(
        new TuyaError("CONNECTION_LOST", "The client is closed"),
      );
    }
    return this.transport.request(method, path, parts);
  }

  private release(): void {
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    if (unsubscribe) {
      this.unsubscribing = Promise.all([
        this.unsubscribing,
        unsubscribe(),
      ]).then(() => {});
    }
  }

  private report(dataPoints: DataPoints): void {
    for (const listener of this.listeners) {
      listener(dataPoints);
    }
  }
}
