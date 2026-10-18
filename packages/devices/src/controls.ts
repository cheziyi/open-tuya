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
  ControlRule,
  ControlTarget,
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
 * control has a rule for its absence. A control that depends on another data
 * point, or reads one instead of its own, reads it from the same
 * `dataPoints`. */
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
 * written may set it too, to the value its condition needs, and one that
 * redirects writes the data point it redirects to instead of its own.
 *
 * It throws a `TypeError` for a control the entry does not have, a
 * read-only one, or a masked one whose data point `current` lacks, a
 * `RangeError` for a value outside the data point's range, and a
 * `TuyaError` with code `VALUE_UNAVAILABLE` for a value that needs a
 * read-only data point to hold another value than it does in `current`, or
 * that redirects to a read-only data point. */
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
      writeControl(entry, control, value, current, dataPoints);
    }
  }
  return dataPoints;
}

/** The control as the device's data points make it now: with the condition
 * that holds applied, and the data point it redirects to followed. Its
 * `min`, `max`, `scale` and `step` are the ones a value takes now. */
export function resolveControl(
  entry: TuyaDeviceEntry,
  control: TuyaControl,
  dataPoints: DataPoints,
): TuyaControl {
  const rule = currentRule(entry, control, dataPoints) ?? ownRule(control);
  const condition = holdingCondition(entry, rule.dependsOn, dataPoints);
  const redirect = condition?.redirect ?? rule.redirect;
  if (redirect) {
    const { kind, measures, unit, unitFrom } = control;
    return resolveControl(
      entry,
      {
        ...redirect,
        kind,
        ...(measures && { measures }),
        ...(unit !== undefined && { unit }),
        ...(unitFrom !== undefined && { unitFrom }),
      },
      dataPoints,
    );
  }
  if (rule.mapping || !condition) {
    return control;
  }
  const { scale, step, invert, targetRange, min, max } = condition;
  return {
    ...control,
    ...(scale !== undefined && { scale }),
    ...(step !== undefined && { step }),
    ...(invert && { invert }),
    ...(targetRange && { targetRange }),
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
  };
}

/** The data points other than its own that a control's value depends on or
 * reads instead, through every data point it redirects or mirrors to. */
export function listDependencies(control: ControlTarget): DataPointId[] {
  const found = new Set<DataPointId>();
  const visit = (target: ControlTarget) => {
    for (const rule of rulesOf(target)) {
      if (rule.dependsOn) {
        found.add(rule.dependsOn.dataPoint);
      }
      const targets = [
        rule.redirect,
        rule.mirror,
        ...(rule.dependsOn?.conditions ?? []).flatMap((condition) => [
          condition.redirect,
          condition.mirror,
        ]),
      ];
      for (const next of targets) {
        if (next) {
          found.add(next.dataPoint);
          visit(next);
        }
      }
    }
  };
  visit(control);
  found.delete(control.dataPoint);
  return [...found];
}

/** The rule a raw value or a written value falls under: one of the control's
 * mappings, its rule for an absent data point, or its own for any other
 * value, which alone converts numbers. */
interface Rule extends ControlRule {
  mapping?: ControlMapping;
  own?: true;
}

function rulesOf(control: ControlTarget): ControlRule[] {
  return [
    ownRule(control),
    ...(control.whenAbsent ? [control.whenAbsent] : []),
    ...(control.values ?? []),
  ];
}

function ownRule(control: ControlTarget): Rule {
  return {
    own: true,
    ...(control.otherwise !== undefined && { value: control.otherwise }),
    ...(control.dependsOn && { dependsOn: control.dependsOn }),
    ...(control.redirect && { redirect: control.redirect }),
    ...(control.mirror && { mirror: control.mirror }),
  };
}

function mappingRule(mapping: ControlMapping): Rule {
  return { ...mapping, mapping };
}

// The rule the data point's value falls under now, with the value it read:
// the rule for an absent data point while the device leaves it out, and
// undefined while it has none, or the value does not decode.
function currentRule(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  dataPoints: DataPoints,
): (Rule & { raw?: DataPointValue }) | undefined {
  const type = entry.dataPoints[control.dataPoint]?.type;
  const raw = dataPoints[control.dataPoint];
  if (raw === undefined) {
    return control.whenAbsent;
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
  return { ...(mapping ? mappingRule(mapping) : ownRule(control)), raw: value };
}

// Source: A raw value matches the first mapping whose dps_val equals it, a
// bitfield's when they share a bit, the one whose dps_val is null while the
// data point is absent, or else the mapping with no dps_val. The last of its
// conditions that holds replaces its value, its redirect, its mirror, its
// nested mapping, invert, target_range and scale. A redirect or a mirror
// reads the other data point as it converts; a number then has invert,
// target_range and scale applied, in that order, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L558-L566,
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L683-L691
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L780-L856.
function readControl(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  dataPoints: DataPoints,
): ControlValue | undefined {
  const rule = currentRule(entry, control, dataPoints);
  if (!rule) {
    return undefined;
  }
  const condition = holdingCondition(entry, rule.dependsOn, dataPoints);
  const target =
    condition?.redirect ?? rule.redirect ?? condition?.mirror ?? rule.mirror;
  if (target) {
    return readControl(entry, target, dataPoints);
  }
  let result = condition?.value ?? rule.value ?? rule.raw;
  if (result === undefined) {
    return undefined;
  }
  for (const nested of condition?.values ?? []) {
    if (nested.value !== undefined && String(nested.raw) === String(result)) {
      result = nested.value;
    }
  }
  if (typeof result !== "number") {
    return result;
  }
  const conversion = { ...(rule.own ? control : {}), ...condition };
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
// set or already holds, or whose mirror reads it, or else of the nearest
// numeric one; otherwise it is multiplied by scale, mapped back from
// target_range, inverted, rounded to step and checked against the range, in
// that order. A condition giving the value, on a constraint that can be set
// and that it names one value of, sets the constraint to it. A redirect
// writes the other data point as it converts, as does the redirect of the
// rule the current value falls under when no rule takes the value, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L876-L976
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L978-L1128.
// A value only a condition on a read-only constraint gives, while it does
// not hold, sets nothing, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/devices/README.md#L505-L509,
// so it throws rather than writes the value as it is.
function writeControl(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  value: ControlValue,
  current: DataPoints,
  dataPoints: Record<string, DataPointValue>,
): void {
  if (control.readOnly) {
    throw new TuyaError(
      "VALUE_UNAVAILABLE",
      `${value} cannot be set: it is written to data point ${control.dataPoint}, which is read-only`,
    );
  }
  const found = findRule(entry, control, value, current);
  const rule = found ?? ownRule(control);
  if (!found) {
    const redirect = currentRule(entry, control, current)?.redirect;
    if (redirect) {
      writeControl(entry, redirect, value, current, dataPoints);
      return;
    }
  }
  const condition = writingCondition(entry, rule.dependsOn, value, current);
  const redirect = condition?.redirect ?? rule.redirect;
  if (redirect) {
    writeControl(entry, redirect, value, current, dataPoints);
    return;
  }
  const dependency = rule.dependsOn;
  if (
    condition &&
    dependency &&
    !dependency.readOnly &&
    dependency.dataPoint !== control.dataPoint &&
    String(condition.value) === String(value) &&
    condition.when.length === 1 &&
    condition.when[0] !== null &&
    condition.when[0] !== undefined
  ) {
    dataPoints[dependency.dataPoint] = condition.when[0];
  }
  let raw: DataPointValue | undefined;
  for (const nested of condition?.values ?? []) {
    if (!nested.readOnly && String(nested.value) === String(value)) {
      raw = nested.raw;
    }
  }
  const id = control.dataPoint;
  const type = entry.dataPoints[id]?.type;
  raw ??=
    rule.mapping?.raw ??
    toRaw(control, fieldType(control, type), value, {
      ...control,
      ...condition,
    });
  if (!isMasked(control)) {
    dataPoints[id] = raw;
    return;
  }
  // Several controls can set bits of one data point: each sets its own on
  // what the ones before it set.
  const base = dataPoints[id] ?? current[id];
  if (base === undefined) {
    throw new TypeError(
      `${value} sets some bits of data point ${id}, so it needs the data point's current value`,
    );
  }
  dataPoints[id] = writeMask(control, type, base, raw);
}

// The rule a written value falls under, or undefined when no mapping takes
// it and the control has no rule of its own for any other value.
function findRule(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  value: ControlValue,
  current: DataPoints,
): Rule | undefined {
  let nearest: ControlMapping | undefined;
  let distance = Number.POSITIVE_INFINITY;
  let unavailable: ControlDependency | undefined;
  for (const mapping of control.values ?? []) {
    if (mapping.readOnly) {
      continue;
    }
    const reach = reachOf(entry, control, mapping, value, current);
    if (reach === "reachable") {
      return mappingRule(mapping);
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
  const own = ownRule(control);
  const reach = reachOf(entry, control, own, value, current);
  if (reach === "reachable") {
    return own;
  }
  if (reach === "unavailable") {
    unavailable ??= own.dependsOn;
  }
  if (unavailable) {
    throw new TuyaError(
      "VALUE_UNAVAILABLE",
      `${value} cannot be set while data point ${unavailable.dataPoint} is ${String(current[unavailable.dataPoint])}`,
    );
  }
  if (nearest) {
    return mappingRule(nearest);
  }
  return hasOwnRule(control) ? own : undefined;
}

// Whether a rule takes `value`: its value is it, its mirror reads it, or one
// of its conditions gives it and can be made to hold, because its constraint
// can be set or already holds.
function reachOf(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  rule: ControlRule,
  value: ControlValue,
  current: DataPoints,
): "reachable" | "unavailable" | undefined {
  if (rule.value !== undefined && String(rule.value) === String(value)) {
    return "reachable";
  }
  if (rule.value === undefined && mirrors(entry, rule.mirror, value, current)) {
    return "reachable";
  }
  const dependency = rule.dependsOn;
  let reach: "unavailable" | undefined;
  for (const condition of dependency?.conditions ?? []) {
    if (condition.readOnly) {
      continue;
    }
    if (condition.value === undefined) {
      if (mirrors(entry, condition.mirror, value, current)) {
        return "reachable";
      }
      continue;
    }
    if (String(condition.value) !== String(value)) {
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

function mirrors(
  entry: TuyaDeviceEntry,
  mirror: ControlTarget | undefined,
  value: ControlValue,
  current: DataPoints,
): boolean {
  if (!mirror) {
    return false;
  }
  const read = readControl(entry, mirror, current);
  return read !== undefined && String(read) === String(value);
}

function hasOwnRule(control: ControlTarget): boolean {
  return (
    control.otherwise !== undefined ||
    control.scale !== undefined ||
    control.step !== undefined ||
    control.invert !== undefined ||
    control.targetRange !== undefined ||
    control.dependsOn !== undefined ||
    control.redirect !== undefined ||
    control.mirror !== undefined
  );
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
// mapped back from target_range and inverted over the control's range,
// rounded to step, and checked against the rule's range.
function toRaw(
  control: ControlTarget,
  type: TuyaDataPointType | undefined,
  value: ControlValue,
  conversion: Pick<
    TuyaControl,
    "scale" | "step" | "invert" | "targetRange" | "min" | "max"
  >,
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
    (conversion.min !== undefined && result < conversion.min) ||
    (conversion.max !== undefined && result > conversion.max)
  ) {
    throw new RangeError(
      `${value} sets data point ${control.dataPoint} to ${result}, outside ${conversion.min ?? "…"} to ${conversion.max ?? "…"}`,
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
