import type { DataPointId, DataPointValue } from "@open-tuya/core";
import type { ControlKind, KnownControlName, Measure } from "./vocabulary.js";

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
  /** The control's value for it. Without one, the raw value is the
   * control's, unless a condition gives another. */
  value?: ControlValue;
  /** Read, but never written: another raw value is written for `value`. */
  readOnly?: true;
  /** Conditions that change this mapping by another data point's value. */
  dependsOn?: ControlDependency;
}

/** The conditions a mapping or a control takes from another data point's
 * value: the last that holds applies. */
export interface ControlDependency {
  /** The data point whose raw value the conditions match. It can be the
   * control's own. */
  dataPoint: DataPointId;
  /** Never written: a value that needs it to change cannot be set. */
  readOnly?: true;
  conditions: readonly ControlCondition[];
}

/** What applies while the data point a `ControlDependency` names holds one of
 * `when`. Each field it gives replaces the mapping's or the control's. */
export interface ControlCondition {
  /** The raw values it holds for, `null` while the device leaves the data
   * point out. On a bitfield, it holds while every bit of one is set. */
  when: readonly (DataPointValue | null)[];
  value?: ControlValue;
  /** Its `value` is read, but never written. */
  readOnly?: true;
  /** Values for the result, matched by `raw` against the value the mapping
   * gives. */
  values?: readonly ControlMapping[];
  scale?: number;
  step?: number;
  invert?: true;
  targetRange?: { min: number; max: number };
}

/** One thing a device does, and how its data point's raw value converts to
 * the control's value. A read takes the bits `mask` covers, finds the raw
 * value in `values`, then takes `otherwise`, then converts a number:
 * `invert`, `targetRange`, then divides by `scale`. A write reverses it,
 * rounds the raw value to `step`, and sets the bits `mask` covers. */
export interface TuyaControl {
  dataPoint: DataPointId;
  /** The raw value is these bits of the data point's value, in hex: the
   * value's bytes, or its integer, read as one unsigned number. A write
   * keeps the other bits, so it needs the data point's current value. */
  mask?: string;
  /** The bits `mask` covers are a signed number, in two's complement. */
  maskSigned?: true;
  /** The value's bytes are read little-endian. Defaults to big-endian. */
  littleEndian?: true;
  kind: ControlKind;
  measures?: Measure;
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
  /** Conditions that change `otherwise`, `scale`, `step`, `invert` or
   * `targetRange` by another data point's value. */
  dependsOn?: ControlDependency;
  /** The control's value runs over this range as the raw value runs over
   * `min` to `max`. */
  targetRange?: { min: number; max: number };
}

/** A component's controls, by name: a name from `CONTROL_NAMES` where the
 * catalog gives the control one alike across devices, or a name of its own. */
export type TuyaComponent = Readonly<
  Partial<Record<KnownControlName, TuyaControl>> & Record<string, TuyaControl>
>;

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
