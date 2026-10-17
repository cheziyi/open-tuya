import type { DataPointId, DataPointValue } from "@open-tuya/core";

/** A data point's type, as tuya-local names it. */
export type TuyaDataPointType =
  | "boolean"
  | "integer"
  | "string"
  | "bitfield"
  | "base64"
  | "hex"
  | "json"
  | "unixtime";

export interface TuyaDataPointSpec {
  type: TuyaDataPointType;
  /** Some devices of the product leave it out. */
  optional?: true;
}

/** The value of a control, after the catalog's conversion of the data
 * point's raw value. */
export type ControlValue = boolean | number | string;

export interface ControlMapping {
  /** The data point's raw value. */
  raw: DataPointValue;
  /** The control's value for it. */
  value: ControlValue;
  /** Read, but never written: another raw value is written for `value`. */
  readOnly?: true;
}

/** One thing a device does, and how its data point's raw value converts to
 * the control's value. A read finds the raw value in `values`, then takes
 * `otherwise`, then converts a number: `invert`, `targetRange`, then divides
 * by `scale`. A write reverses it, and rounds the raw value to `step`. */
export interface TuyaControl {
  dataPoint: DataPointId;
  readOnly?: true;
  /** The unit of the control's value, as tuya-local writes it. */
  unit?: string;
  /** The name of the control in the same component whose value is this
   * control's unit, on a device that switches unit at runtime. */
  unitFrom?: string;
  /** The raw value's range. */
  min?: number;
  max?: number;
  /** Raw values with a meaning of their own. */
  values?: readonly ControlMapping[];
  /** The control's value for any raw value `values` does not name. */
  otherwise?: ControlValue;
  /** The control's value while the device leaves the data point out. */
  absent?: ControlValue;
  /** The raw value is the control's value times this. */
  scale?: number;
  /** The raw value is a multiple of this. */
  step?: number;
  /** The raw value runs from `max` to `min` as the control's runs up. */
  invert?: true;
  /** The control's value runs over this range as the raw value runs over
   * `min` to `max`. */
  targetRange?: { min: number; max: number };
}

/** A component's controls, by name. */
export type TuyaComponent = Readonly<Record<string, TuyaControl>>;

/** A device as the catalog describes it. */
export interface TuyaDeviceEntry {
  name: string;
  /** The product keys it matches. One product key can match more than one
   * entry. */
  productKeys: readonly string[];
  /** Every data point the entry names, for matching a device by those it
   * reports. */
  dataPoints: Readonly<Record<DataPointId, TuyaDataPointSpec>>;
  /** The device's parts, such as a light and its backlight, each with its
   * controls. */
  components: Readonly<Record<string, TuyaComponent>>;
  /** The tuya-local device file the entry was converted from, and the
   * commit that last changed it. */
  source: { file: string; commit: string };
}
