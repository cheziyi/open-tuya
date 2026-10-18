import {
  type DataPoints,
  type DataPointValue,
  isDataPointValue,
  type TuyaClient,
  TuyaError,
} from "@open-tuya/core";
import type { DataPointCodes } from "./dataPointCodes.js";
import type { DeviceRecord } from "./protocol/records.js";

export interface RequestParts {
  query?: Readonly<Record<string, unknown>>;
  body?: Readonly<Record<string, unknown>>;
}

/** What a client reaches the cloud through: its account. */
export interface AppCloudTransport {
  request(method: string, path: string, parts?: RequestParts): Promise<unknown>;
  /** Hands `listener` the data points the device pushes. Returns a function
   * that removes it, and resolves once what it held is released. */
  subscribe(listener: (dataPoints: DataPoints) => void): () => Promise<void>;
}

// Source: A device's data points are read from its details, keyed by code,
// and written as commands keyed by code, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
/** A device reached through the cloud the Smart Life app signs in to. Create
 * one with `AppCloudAccount.createClient`. It reads and writes only the data
 * points whose values the cloud passes through unchanged, and hands its
 * listeners every data point the cloud pushes. */
export class AppCloudTuyaClient implements TuyaClient {
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  private readonly idsByCode: ReadonlyMap<string, string>;
  private readonly unsubscribe: (() => Promise<void>) | undefined;
  private closed = false;

  constructor(
    private readonly transport: AppCloudTransport,
    private readonly deviceId: string,
    private readonly codes: DataPointCodes,
  ) {
    this.idsByCode = new Map(
      [...codes.byId].map(([id, code]) => [code, id] as const),
    );
    this.unsubscribe = codes.pushedById
      ? transport.subscribe((dataPoints) => this.report(dataPoints))
      : undefined;
  }

  get connected(): boolean {
    return !this.closed;
  }

  /** It leaves out the data points the cloud does not map. */
  async readDataPoints(): Promise<DataPoints> {
    const devices = (await this.request(
      "GET",
      "/v1.0/m/life/ha/devices/detail",
      { query: { devIds: this.deviceId } },
    )) as DeviceRecord[];
    const device = devices.find(({ id }) => id === this.deviceId);
    if (!device) {
      throw new TuyaError(
        "REQUEST_REJECTED",
        `The cloud does not list device ${this.deviceId}`,
      );
    }
    const dataPoints: Record<string, DataPointValue> = {};
    for (const { code, value } of device.status ?? []) {
      const id = this.idsByCode.get(code);
      if (id !== undefined && isDataPointValue(value)) {
        dataPoints[id] = value;
      }
    }
    return dataPoints;
  }

  /** It resolves once the cloud takes the write. It rejects with a
   * `TuyaError` with code `UNMAPPED_DATA_POINT`, sending nothing, when a
   * data point is one the cloud does not map. */
  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    const commands = Object.entries(dataPoints).map(([id, value]) => {
      const code = this.codes.byId.get(id);
      if (code === undefined) {
        throw new TuyaError(
          "UNMAPPED_DATA_POINT",
          `The cloud maps no code to data point ${id} of device ${this.deviceId}`,
        );
      }
      return { code, value };
    });
    await this.request(
      "POST",
      `/v1.1/m/thing/${encodeURIComponent(this.deviceId)}/commands`,
      { body: { commands } },
    );
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.unsubscribe?.();
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

  private report(dataPoints: DataPoints): void {
    for (const listener of this.listeners) {
      listener(dataPoints);
    }
  }
}
