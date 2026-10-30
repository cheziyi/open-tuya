import type {
  DataPoints,
  DataPointValue,
  TuyaClient,
  TuyaCloudAccount,
  TuyaCloudDevice,
  TuyaDeviceModel,
} from "@open-tuya/core";

/** A route's client, holding data points in memory. */
export class FakeTuyaClient implements TuyaClient {
  connected = true;
  /** While set, every request rejects with it. */
  failure: unknown;
  /** Each request's kind, in order, including those that failed. */
  readonly requests: ("read" | "write")[] = [];
  /** Every write taken. */
  readonly writes: DataPoints[] = [];
  closes = 0;
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();

  constructor(readonly dataPoints: Record<string, DataPointValue> = {}) {}

  async readDataPoints(): Promise<DataPoints> {
    this.requests.push("read");
    if (this.failure) {
      throw this.failure;
    }
    return { ...this.dataPoints };
  }

  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    this.requests.push("write");
    if (this.failure) {
      throw this.failure;
    }
    this.writes.push(dataPoints);
    Object.assign(this.dataPoints, dataPoints);
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Hands `dataPoints` to the listeners, as a device's push. */
  push(dataPoints: DataPoints): void {
    for (const listener of this.listeners) {
      listener(dataPoints);
    }
  }

  async close(): Promise<void> {
    this.closes++;
    this.connected = false;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

/** A cloud account whose clients are `FakeTuyaClient`s over one set of data
 * points. */
export class FakeTuyaCloudAccount implements TuyaCloudAccount {
  /** While set, `createClient` rejects with it. */
  failure: unknown;
  /** Every client built, in order. */
  readonly clients: FakeTuyaClient[] = [];
  createCalls = 0;
  closed = false;
  /** What `readDeviceModel` resolves with. */
  model: TuyaDeviceModel = {};
  /** While set, `readDeviceModel` rejects with it. */
  modelFailure: unknown;

  constructor(readonly dataPoints: Record<string, DataPointValue> = {}) {}

  async listDevices(): Promise<TuyaCloudDevice[]> {
    return [];
  }

  async createClient(): Promise<FakeTuyaClient> {
    this.createCalls++;
    if (this.failure) {
      throw this.failure;
    }
    const client = new FakeTuyaClient(this.dataPoints);
    this.clients.push(client);
    return client;
  }

  async readDeviceModel(): Promise<TuyaDeviceModel> {
    if (this.modelFailure) {
      throw this.modelFailure;
    }
    return this.model;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
