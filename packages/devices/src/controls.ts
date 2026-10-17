import type { DataPoints, DataPointValue } from "@open-tuya/core";
import type {
  ControlValue,
  TuyaControl,
  TuyaDataPointType,
  TuyaDeviceEntry,
} from "./entry.js";
import type { KnownControlName } from "./vocabulary.js";

/** Control values by component, then by control name. */
export type ControlValues = Readonly<
  Record<
    string,
    Readonly<
      Partial<Record<KnownControlName, ControlValue>> &
        Record<string, ControlValue>
    >
  >
>;

const NUMERIC_TYPES: ReadonlySet<TuyaDataPointType> = new Set([
  "integer",
  "bitfield",
  "unixtime",
]);

/** Converts a device's data points to the entry's control values. It leaves
 * out a control whose data point the device did not report, unless the
 * control has a value for its absence. */
export function readControls(
  entry: TuyaDeviceEntry,
  dataPoints: DataPoints,
): ControlValues {
  const values: Record<string, Record<string, ControlValue>> = {};
  for (const [componentName, component] of Object.entries(entry.components)) {
    const read: Record<string, ControlValue> = {};
    for (const [name, control] of Object.entries(component)) {
      const value = readControl(
        control,
        entry.dataPoints[control.dataPoint]?.type,
        dataPoints[control.dataPoint],
      );
      if (value !== undefined) {
        read[name] = value;
      }
    }
    if (Object.keys(read).length > 0) {
      values[componentName] = read;
    }
  }
  return values;
}

/** Converts control values to the data points that set them. It throws a
 * `TypeError` for a control the entry does not have or a read-only one, and
 * a `RangeError` for a value outside the data point's range. */
export function writeControls(
  entry: TuyaDeviceEntry,
  values: ControlValues,
): DataPoints {
  const dataPoints: Record<string, DataPointValue> = {};
  for (const [componentName, controls] of Object.entries(values)) {
    for (const [name, value] of Object.entries(controls)) {
      const control = entry.components[componentName]?.[name];
      if (!control) {
        throw new TypeError(
          `${entry.name} has no control ${componentName}.${name}`,
        );
      }
      if (control.readOnly) {
        throw new TypeError(`${componentName}.${name} is read-only`);
      }
      dataPoints[control.dataPoint] = writeControl(
        control,
        entry.dataPoints[control.dataPoint]?.type,
        value,
      );
    }
  }
  return dataPoints;
}

// Source: A raw value matches the first mapping whose dps_val equals it, a
// bitfield's when they share a bit; a number then has invert, target_range
// and scale applied, in that order, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L558-L566
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L780-L856.
function readControl(
  control: TuyaControl,
  type: TuyaDataPointType | undefined,
  raw: DataPointValue | undefined,
): ControlValue | undefined {
  if (raw === undefined) {
    return control.absent;
  }
  const value = numericFromString(type, raw);
  const mapping = control.values?.find((candidate) =>
    matches(type, candidate.raw, value),
  );
  if (mapping) {
    return mapping.value;
  }
  if (control.otherwise !== undefined) {
    return control.otherwise;
  }
  if (typeof value !== "number") {
    return value;
  }
  let result = value;
  const min = control.min ?? 0;
  if (control.invert && control.max !== undefined) {
    result = min + control.max - result;
  }
  if (control.targetRange && control.max !== undefined) {
    const { min: toMin, max: toMax } = control.targetRange;
    result = toMin + ((result - min) * (toMax - toMin)) / (control.max - min);
  }
  if (control.scale !== undefined) {
    result /= control.scale;
  }
  return result;
}

// Source: A value written takes the raw value of the mapping whose value
// equals it, or of the nearest numeric one; otherwise it is multiplied by
// scale, mapped back from target_range, inverted, rounded to step and checked
// against the range, in that order, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L876-L931
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L978-L1128.
function writeControl(
  control: TuyaControl,
  type: TuyaDataPointType | undefined,
  value: ControlValue,
): DataPointValue {
  const writable = (control.values ?? []).filter(
    (mapping) => !mapping.readOnly,
  );
  const exact = writable.find(
    (mapping) => String(mapping.value) === String(value),
  );
  if (exact) {
    return exact.raw;
  }
  if (typeof value !== "number") {
    return value;
  }
  let nearest: DataPointValue | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const mapping of writable) {
    if (
      typeof mapping.value === "number" &&
      Math.abs(mapping.value - value) < distance
    ) {
      distance = Math.abs(mapping.value - value);
      nearest = mapping.raw;
    }
  }
  if (nearest !== undefined) {
    return nearest;
  }
  let result = value;
  const min = control.min ?? 0;
  if (control.scale !== undefined) {
    result *= control.scale;
  }
  if (control.targetRange && control.max !== undefined) {
    const { min: fromMin, max: fromMax } = control.targetRange;
    result =
      min + ((result - fromMin) * (control.max - min)) / (fromMax - fromMin);
  }
  if (control.invert && control.max !== undefined) {
    result = min + control.max - result;
  }
  if (control.step !== undefined) {
    result = control.step * Math.round(result / control.step);
  }
  if (type && NUMERIC_TYPES.has(type)) {
    result = Math.round(result);
  }
  if (
    (control.min !== undefined && result < control.min) ||
    (control.max !== undefined && result > control.max)
  ) {
    throw new RangeError(
      `${value} sets data point ${control.dataPoint} to ${result}, outside ${control.min ?? "…"} to ${control.max ?? "…"}`,
    );
  }
  return result;
}

function matches(
  type: TuyaDataPointType | undefined,
  raw: DataPointValue,
  value: DataPointValue,
): boolean {
  if (type === "bitfield" && raw) {
    return (Number(value) & Number(raw)) !== 0;
  }
  return String(raw) === String(value);
}

// Source: A device can send a number as a string, read as the number, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L780-L789.
function numericFromString(
  type: TuyaDataPointType | undefined,
  raw: DataPointValue,
): DataPointValue {
  if (
    typeof raw === "string" &&
    type &&
    NUMERIC_TYPES.has(type) &&
    raw.trim() !== "" &&
    !Number.isNaN(Number(raw))
  ) {
    return Number(raw);
  }
  return raw;
}
