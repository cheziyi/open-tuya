import { type DataPoints, type TuyaClient, TuyaError } from "@open-tuya/core";

/** What a client of a device behind a gateway reaches it through: the
 * gateway's client. */
export interface SubDeviceTransport {
  /** Whether the gateway is connected, and does not report the device
   * offline. */
  connected(): boolean;
  read(): Promise<DataPoints>;
  write(dataPoints: DataPoints): Promise<void>;
  /** Hands `listener` the data points the device reports. Returns a function
   * that removes it. */
  subscribe(listener: (dataPoints: DataPoints) => void): () => void;
}

/** A device behind a gateway, reached over the gateway's connection. Create
 * one with `LocalTuyaClient.createClient`. Closing it leaves the gateway's
 * connection open: closing the gateway's client closes it. */
export class SubDeviceTuyaClient implements TuyaClient {
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  private readonly unsubscribe: () => void;
  private closed = false;

  constructor(private readonly transport: SubDeviceTransport) {
    this.unsubscribe = transport.subscribe((dataPoints) => {
      for (const listener of this.listeners) {
        listener(dataPoints);
      }
    });
  }

  /** Whether the gateway is connected and does not report the device
   * offline. A gateway that never answers the online query, as some 3.3
   * gateways do not, leaves its devices connected while it is. */
  get connected(): boolean {
    return !this.closed && this.transport.connected();
  }

  /** It rejects as `LocalTuyaClient.readDataPoints` does. A gateway answers
   * "json obj data unvalid" for a device it cannot read now, such as one
   * asleep or offline, or every device until each is written once after the
   * gateway restarts. */
  async readDataPoints(): Promise<DataPoints> {
    this.ensureOpen();
    return this.transport.read();
  }

  /** It rejects as `LocalTuyaClient.writeDataPoints` does. */
  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    this.ensureOpen();
    await this.transport.write(dataPoints);
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.unsubscribe();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new TuyaError("CONNECTION_LOST", "The client is closed");
    }
  }
}
