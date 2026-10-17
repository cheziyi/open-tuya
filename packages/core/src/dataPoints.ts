/** A data point's ID, as the device numbers it: "1", "20". */
export type DataPointId = string;

/** A data point's value as the device sends it: an integer unscaled, an enum
 * as its label, a bitmap as an integer, and raw bytes as base64. */
export type DataPointValue = boolean | number | string;

export type DataPoints = Readonly<Record<DataPointId, DataPointValue>>;

export function isDataPointValue(value: unknown): value is DataPointValue {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}
