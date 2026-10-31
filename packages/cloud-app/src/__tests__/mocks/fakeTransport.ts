import type { DataPoints } from "@open-tuya/core";
import type { AppCloudTransport } from "../../client.js";

/** An account as a client sees it: it answers nothing, and hands a test the
 * listeners subscribed, so it can push to them. */
export class FakeTransport implements AppCloudTransport {
  readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  /** How many times a client subscribed. */
  subscribes = 0;
  /** What `isOnline` answers. */
  online: boolean | undefined;

  request(): Promise<unknown> {
    return Promise.reject(new Error("FakeTransport answers no request"));
  }

  isOnline(): boolean | undefined {
    return this.online;
  }

  subscribe(listener: (dataPoints: DataPoints) => void): () => Promise<void> {
    this.subscribes++;
    this.listeners.add(listener);
    return async () => {
      this.listeners.delete(listener);
    };
  }

  push(dataPoints: DataPoints): void {
    for (const listener of this.listeners) {
      listener(dataPoints);
    }
  }
}
