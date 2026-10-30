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
  /** The reading is an integer's value divided by 10 to this power. */
  scale?: number;
  /** As the cloud writes it, such as `℃` or `%`. */
  unit?: string;
}

/** What each of a device's data points stands for, by ID, as the cloud's
 * model of the device says. */
export type TuyaDeviceModel = Readonly<Record<DataPointId, TuyaModelDataPoint>>;

// Source: An integer's min, max, scale and step are read as Python's int()
// reads them, which takes a numeric string, in
// https://github.com/home-assistant-libs/tuya-device-handlers/commit/7d9b35afd9c3e3d135ed8b112517edfba70467d5.
/** Reads the values each cloud's description of a data point holds under
 * these same names, leaving out any that is not of its type. */
export function readModelValues(
  fields: Readonly<Record<string, unknown>>,
): Omit<TuyaModelDataPoint, "code" | "type"> {
  const { range, unit } = fields;
  const values: Omit<TuyaModelDataPoint, "code" | "type"> = {
    ...(Array.isArray(range) &&
      range.every((value) => typeof value === "string") && { range }),
    ...(typeof unit === "string" && unit !== "" && { unit }),
  };
  for (const name of ["min", "max", "step", "scale"] as const) {
    const value = readNumber(fields[name]);
    if (value !== undefined) {
      values[name] = value;
    }
  }
  return values;
}

function readNumber(value: unknown): number | undefined {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isFinite(number) ? (number as number) : undefined;
}
