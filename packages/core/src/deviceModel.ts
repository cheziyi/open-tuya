import type { DataPointId } from "./dataPoints.js";

/** The types a device's model gives a data point. */
export const MODEL_TYPES = [
  "boolean",
  "integer",
  "enum",
  "string",
  "bitmap",
  "raw",
] as const;

export type ModelType = (typeof MODEL_TYPES)[number];

/** A data point as the cloud's model of the device describes it, in the
 * device's own terms: the values are what the device sends. */
export interface TuyaModelDataPoint {
  /** The code it stands for in Tuya's standard instruction set, such as
   * `temp_current`. */
  code: string;
  type: ModelType;
  /** The values an enum takes. */
  range?: readonly string[];
  /** An integer's range and step, before its scale. */
  min?: number;
  max?: number;
  step?: number;
  /** An integer is its value times 10 to this power. */
  scale?: number;
  /** As the cloud writes it, such as `℃` or `%`. */
  unit?: string;
}

/** What each of a device's data points stands for, by ID, as the cloud's
 * model of the device says. */
export type TuyaDeviceModel = Readonly<Record<DataPointId, TuyaModelDataPoint>>;
