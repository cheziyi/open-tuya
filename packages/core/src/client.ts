import type { DataPoints } from "./dataPoints.js";

/** One device, reached by one route: the LAN or a cloud. */
export interface TuyaClient {
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
  close(): void;
}
