import { type DataPoints, type TuyaClient, TuyaError } from "@open-tuya/core";

const FIRST_RETRY_DELAY_IN_MS = 5000;
const MAX_RETRY_DELAY_IN_MS = 60_000;

/** A device reached through a cloud account, whose client the account
 * builds when the route is created. A build that fails is tried again 5 s
 * later, doubling to 60 s, but not after an error that is not a `TuyaError`,
 * or one with code `SESSION_EXPIRED` or `PERMISSION_DENIED`, none of which
 * clears by waiting. A request waits for a build in flight, and fails at once
 * with the last build's error while none is. */
export class CloudRoute implements TuyaClient {
  private client: TuyaClient | undefined;
  private building: Promise<TuyaClient> | undefined;
  private lastError: unknown;
  private retryDelayInMs = FIRST_RETRY_DELAY_IN_MS;
  private retryTimer: NodeJS.Timeout | undefined;
  private closed = false;
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();

  constructor(private readonly createClient: () => Promise<TuyaClient>) {
    this.build();
  }

  get connected(): boolean {
    return !this.closed && (this.client?.connected ?? false);
  }

  async readDataPoints(): Promise<DataPoints> {
    return (await this.built()).readDataPoints();
  }

  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    await (await this.built()).writeDataPoints(dataPoints);
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.retryTimer);
    const client = await this.building?.catch(() => undefined);
    await client?.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private build(): void {
    const building = this.createClient();
    this.building = building;
    building.then(
      (client) => {
        if (this.closed) {
          return;
        }
        this.client = client;
        client.onDataPoints((dataPoints) => {
          for (const listener of this.listeners) {
            listener(dataPoints);
          }
        });
      },
      (error: unknown) => {
        this.building = undefined;
        this.lastError = error;
        if (
          !this.closed &&
          error instanceof TuyaError &&
          error.code !== "SESSION_EXPIRED" &&
          error.code !== "PERMISSION_DENIED"
        ) {
          this.retryTimer = setTimeout(() => this.build(), this.retryDelayInMs);
          this.retryDelayInMs = Math.min(
            this.retryDelayInMs * 2,
            MAX_RETRY_DELAY_IN_MS,
          );
        }
      },
    );
  }

  private async built(): Promise<TuyaClient> {
    if (this.closed) {
      throw new TuyaError("CONNECTION_LOST", "The client is closed");
    }
    if (!this.building) {
      throw this.lastError;
    }
    return this.building;
  }
}
