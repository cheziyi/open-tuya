import {
  type DataPointId,
  type DataPoints,
  type DataPointValue,
  TuyaError,
} from "@open-tuya/core";
import type {
  ControlCondition,
  ControlDependency,
  ControlMapping,
  ControlValue,
  TuyaControl,
  TuyaDataPointType,
  TuyaDeviceEntry,
} from "./entry.js";
import { fieldType, isMasked, readMask, writeMask } from "./mask.js";
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
 * control has a value for its absence. A control that depends on another
 * data point reads it from the same `dataPoints`. */
export function readControls(
  entry: TuyaDeviceEntry,
  dataPoints: DataPoints,
): ControlValues {
  const values: Record<string, Record<string, ControlValue>> = {};
  for (const [componentName, component] of Object.entries(entry.components)) {
    const read: Record<string, ControlValue> = {};
    for (const [name, control] of Object.entries(component)) {
      const value = readControl(entry, control, dataPoints);
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

/** Converts control values to the data points that set them, reading from
 * `current`, the data points the device reports now, what a control needs
 * of them. A control with a `mask` sets some bits of its data point and
 * keeps the rest. A control that depends on another data point that can be
 * written may set it too, to the value its condition needs.
 *
 * It throws a `TypeError` for a control the entry does not have, a
 * read-only one, or a masked one whose data point `current` lacks, a
 * `RangeError` for a value outside the data point's range, and a
 * `TuyaError` with code `VALUE_UNAVAILABLE` for a value that needs a
 * read-only data point to hold another value than it does in `current`. */
export function writeControls(
  entry: TuyaDeviceEntry,
  values: ControlValues,
  current: DataPoints = {},
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
      const id = control.dataPoint;
      const type = entry.dataPoints[id]?.type;
      const { raw, constraint } = writeControl(entry, control, value, current);
      if (constraint) {
        dataPoints[constraint.dataPoint] = constraint.raw;
      }
      if (!isMasked(control)) {
        dataPoints[id] = raw;
        continue;
      }
      // Several controls can set bits of one data point: each sets its own
      // on what the ones before it set.
      const base = dataPoints[id] ?? current[id];
      if (base === undefined) {
        throw new TypeError(
          `${componentName}.${name} sets some bits of data point ${id}, so it needs the data point's current value`,
        );
      }
      dataPoints[id] = writeMask(control, type, base, raw);
    }
  }
  return dataPoints;
}

/** The data points other than its own that a control's value depends on. */
export function listDependencies(control: TuyaControl): DataPointId[] {
  const dependencies = [
    control.dependsOn,
    ...(control.values ?? []).map((mapping) => mapping.dependsOn),
  ].flatMap((dependency) =>
    dependency && dependency.dataPoint !== control.dataPoint
      ? [dependency.dataPoint]
      : [],
  );
  return [...new Set(dependencies)];
}

/** The rule a raw value or a written value falls under: one of the control's
 * mappings, or the control's own for any other value. */
interface Rule {
  mapping?: ControlMapping;
  dependency?: ControlDependency;
}

// Source: A raw value matches the first mapping whose dps_val equals it, a
// bitfield's when they share a bit, or else the mapping with no dps_val. The
// last of its conditions that holds replaces its value, its nested mapping,
// invert, target_range and scale, and a number then has invert, target_range
// and scale applied, in that order, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L558-L566,
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L683-L691
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L780-L856.
function readControl(
  entry: TuyaDeviceEntry,
  control: TuyaControl,
  dataPoints: DataPoints,
): ControlValue | undefined {
  const type = entry.dataPoints[control.dataPoint]?.type;
  const raw = dataPoints[control.dataPoint];
  if (raw === undefined) {
    return control.absent;
  }
  const value = isMasked(control)
    ? readMask(control, type, raw)
    : numericFromString(type, raw);
  if (value === undefined) {
    return undefined;
  }
  const mapping = control.values?.find((candidate) =>
    matches(fieldType(control, type), candidate.raw, value),
  );
  const condition = holdingCondition(
    entry,
    mapping ? mapping.dependsOn : control.dependsOn,
    dataPoints,
  );
  let result: ControlValue =
    condition?.value ?? (mapping ? mapping.value : control.otherwise) ?? value;
  for (const nested of condition?.values ?? []) {
    if (nested.value !== undefined && String(nested.raw) === String(result)) {
      result = nested.value;
    }
  }
  if (typeof result !== "number") {
    return result;
  }
  // A mapping converts no number of its own: only a condition on it does.
  const conversion = { ...(mapping ? {} : control), ...condition };
  const min = control.min ?? 0;
  if (conversion.invert && control.max !== undefined) {
    result = min + control.max - result;
  }
  if (conversion.targetRange && control.max !== undefined) {
    const { min: toMin, max: toMax } = conversion.targetRange;
    result = toMin + ((result - min) * (toMax - toMin)) / (control.max - min);
  }
  if (conversion.scale !== undefined) {
    result /= conversion.scale;
  }
  return result;
}

// Source: A value written takes the raw value of the mapping whose value
// equals it, or one of whose conditions gives it while its constraint can be
// set or already holds, or else of the nearest numeric one; otherwise it is
// multiplied by scale, mapped back from target_range, inverted, rounded to
// step and checked against the range, in that order. A condition giving the
// value, on a constraint that can be set and that it names one value of, sets
// the constraint to it, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L876-L976
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L978-L1128.
// A value only a condition on a read-only constraint gives, while it does
// not hold, sets nothing, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L505-L509,
// so it throws rather than writes the value as it is.
function writeControl(
  entry: TuyaDeviceEntry,
  control: TuyaControl,
  value: ControlValue,
  current: DataPoints,
): {
  raw: DataPointValue;
  constraint?: { dataPoint: DataPointId; raw: DataPointValue };
} {
  const rule = findRule(entry, control, value, current);
  const condition = writingCondition(entry, rule.dependency, value, current);
  const dependency = rule.dependency;
  const constraint =
    condition &&
    dependency &&
    !dependency.readOnly &&
    dependency.dataPoint !== control.dataPoint &&
    String(condition.value) === String(value) &&
    condition.when.length === 1 &&
    condition.when[0] !== null &&
    condition.when[0] !== undefined
      ? { dataPoint: dependency.dataPoint, raw: condition.when[0] }
      : undefined;
  let raw: DataPointValue | undefined;
  for (const nested of condition?.values ?? []) {
    if (!nested.readOnly && String(nested.value) === String(value)) {
      raw = nested.raw;
    }
  }
  raw ??=
    rule.mapping?.raw ??
    toRaw(
      control,
      fieldType(control, entry.dataPoints[control.dataPoint]?.type),
      value,
      { ...control, ...condition },
    );
  return { raw, ...(constraint && { constraint }) };
}

function findRule(
  entry: TuyaDeviceEntry,
  control: TuyaControl,
  value: ControlValue,
  current: DataPoints,
): Rule {
  let nearest: ControlMapping | undefined;
  let distance = Number.POSITIVE_INFINITY;
  let unavailable: ControlDependency | undefined;
  for (const mapping of control.values ?? []) {
    if (mapping.readOnly) {
      continue;
    }
    if (
      mapping.value !== undefined &&
      String(mapping.value) === String(value)
    ) {
      return {
        mapping,
        ...(mapping.dependsOn && { dependency: mapping.dependsOn }),
      };
    }
    const reach = reachThroughCondition(
      entry,
      control,
      mapping.dependsOn,
      value,
      current,
    );
    if (reach === "reachable") {
      return {
        mapping,
        ...(mapping.dependsOn && { dependency: mapping.dependsOn }),
      };
    }
    if (reach === "unavailable") {
      unavailable ??= mapping.dependsOn;
    }
    if (
      typeof mapping.value === "number" &&
      typeof value === "number" &&
      Math.abs(mapping.value - value) < distance
    ) {
      distance = Math.abs(mapping.value - value);
      nearest = mapping;
    }
  }
  const own = control.dependsOn && { dependency: control.dependsOn };
  if (
    control.otherwise !== undefined &&
    String(control.otherwise) === String(value)
  ) {
    return { ...own };
  }
  const reach = reachThroughCondition(
    entry,
    control,
    control.dependsOn,
    value,
    current,
  );
  if (reach === "reachable") {
    return { ...own };
  }
  if (reach === "unavailable") {
    unavailable ??= control.dependsOn;
  }
  if (unavailable) {
    throw new TuyaError(
      "VALUE_UNAVAILABLE",
      `${value} cannot be set while data point ${unavailable.dataPoint} is ${String(current[unavailable.dataPoint])}`,
    );
  }
  if (nearest) {
    return {
      mapping: nearest,
      ...(nearest.dependsOn && { dependency: nearest.dependsOn }),
    };
  }
  return { ...own };
}

// Whether a condition of `dependency` gives `value`, and can be made to hold:
// its constraint can be set, or already holds.
function reachThroughCondition(
  entry: TuyaDeviceEntry,
  control: TuyaControl,
  dependency: ControlDependency | undefined,
  value: ControlValue,
  current: DataPoints,
): "reachable" | "unavailable" | undefined {
  let reach: "unavailable" | undefined;
  for (const condition of dependency?.conditions ?? []) {
    if (condition.readOnly || String(condition.value) !== String(value)) {
      continue;
    }
    if (
      (!dependency?.readOnly && dependency?.dataPoint !== control.dataPoint) ||
      (dependency && holds(entry, dependency, condition, current))
    ) {
      return "reachable";
    }
    reach = "unavailable";
  }
  return reach;
}

// The condition a write applies: the first giving the value written, or else
// the last that holds.
function writingCondition(
  entry: TuyaDeviceEntry,
  dependency: ControlDependency | undefined,
  value: ControlValue,
  current: DataPoints,
): ControlCondition | undefined {
  const giving = dependency?.conditions.find(
    (condition) => String(condition.value) === String(value),
  );
  return giving ?? holdingCondition(entry, dependency, current);
}

function holdingCondition(
  entry: TuyaDeviceEntry,
  dependency: ControlDependency | undefined,
  dataPoints: DataPoints,
): ControlCondition | undefined {
  let holding: ControlCondition | undefined;
  for (const condition of dependency?.conditions ?? []) {
    if (dependency && holds(entry, dependency, condition, dataPoints)) {
      holding = condition;
    }
  }
  return holding;
}

// Source: A condition holds while its constraint's raw value equals or is in
// its dps_val, while the constraint is absent for a dps_val of null, or on a
// bitfield while every bit of its dps_val is set, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L933-L976.
function holds(
  entry: TuyaDeviceEntry,
  dependency: ControlDependency,
  condition: ControlCondition,
  dataPoints: DataPoints,
): boolean {
  const raw = dataPoints[dependency.dataPoint];
  if (raw === undefined) {
    return condition.when.includes(null);
  }
  const bitfield = entry.dataPoints[dependency.dataPoint]?.type === "bitfield";
  return condition.when.some(
    (when) =>
      when !== null &&
      (String(when) === String(raw) ||
        (bitfield && (Number(raw) & Number(when)) === Number(when))),
  );
}

// A number's raw value through the rule's conversion: multiplied by scale,
// mapped back from target_range, inverted, rounded to step and checked
// against the range.
function toRaw(
  control: TuyaControl,
  type: TuyaDataPointType | undefined,
  value: ControlValue,
  conversion: Pick<TuyaControl, "scale" | "step" | "invert" | "targetRange">,
): DataPointValue {
  if (typeof value !== "number") {
    return value;
  }
  let result = value;
  const min = control.min ?? 0;
  if (conversion.scale !== undefined) {
    result *= conversion.scale;
  }
  if (conversion.targetRange && control.max !== undefined) {
    const { min: fromMin, max: fromMax } = conversion.targetRange;
    result =
      min + ((result - fromMin) * (control.max - min)) / (fromMax - fromMin);
  }
  if (conversion.invert && control.max !== undefined) {
    result = min + control.max - result;
  }
  if (conversion.step !== undefined) {
    result = conversion.step * Math.round(result / conversion.step);
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
