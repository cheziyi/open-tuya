import type { DataPoints } from "./dataPoints.js";

/** One device, reached by one route: the LAN or a cloud. `await using`
 * closes it at the end of its scope. */
export interface TuyaClient extends AsyncDisposable {
  /** Whether a request goes out at once: false while a LAN client connects
   * or waits to reconnect, and once a client is closed. A cloud client is
   * connected until it is closed. */
  readonly connected: boolean;
  /** Reads the data points the device reports now. A device may leave some
   * out. */
  readDataPoints(): Promise<DataPoints>;
  /** Resolves once the device takes the write. The new values arrive through
   * `onDataPoints`, if the device reports them. */
  writeDataPoints(dataPoints: DataPoints): Promise<void>;
  /** Calls `listener` with the data points the device reports, as they
   * arrive: one at a time on some devices. Returns a function that removes
   * the listener. */
  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void;
  /** Stops the client, and resolves once its connections are released. */
  close(): Promise<void>;
}
