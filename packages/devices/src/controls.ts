import {
  type DataPointId,
  type DataPoints,
  type DataPointValue,
  TuyaError,
} from "@open-tuya/core";
import type {
  ControlCondition,
  ControlDependency,
  ControlRule,
  ControlTarget,
  ControlValue,
  TuyaControl,
  TuyaDataPointType,
  TuyaDeviceEntry,
} from "./entry.js";
import { fieldType, isMasked, readMask, writeMask } from "./mask.js";
import {
  isNumber,
  isTruthy,
  parseInteger,
  pyEq,
  pyRound,
  pyStr,
} from "./python.js";
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
const PACKED_TYPES: ReadonlySet<TuyaDataPointType> = new Set(["base64", "hex"]);

/** Converts a device's data points to the entry's control values. A control
 * whose data point the device did not report reads by its rule for that,
 * else by its own rule, and is left out where neither gives it a value. A
 * control that depends on another data point, or reads one instead of its
 * own, reads it from the same `dataPoints`. */
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
 * read-only one, a masked one whose data point `current` lacks, or a value
 * no rule takes that does not fit the data point's type, such as a mode the
 * device does not have; a `RangeError` for a value outside the data point's
 * range; and a `TuyaError` with code `VALUE_UNAVAILABLE` for a value that
 * needs a read-only data point to hold another value than it does in
 * `current`, or that redirects to a read-only data point. */
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
  const decoded = decode(entry, control, dataPoints[control.dataPoint]);
  const rule =
    (decoded && ruleForRaw(entry, control, decoded.value, dataPoints)) ??
    ownRule(control);
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
  if (rule.kind === "mapping" || !condition) {
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
 * reads instead, through every data point it redirects or mirrors to, or
 * whose value makes a rule of it available. */
export function listDependencies(control: ControlTarget): DataPointId[] {
  const found = new Set<DataPointId>();
  const visit = (target: ControlTarget) => {
    for (const rule of rulesOf(target)) {
      if (rule.dependsOn) {
        found.add(rule.dependsOn.dataPoint);
      }
      const targets = [
        rule.dependsOn?.constraint,
        rule.redirect,
        rule.mirror,
        rule.availableWhile,
        ...(rule.dependsOn?.conditions ?? []).flatMap((condition) => [
          condition.redirect,
          condition.mirror,
          condition.availableWhile,
        ]),
      ];
      for (const next of targets) {
        if (next && !found.has(next.dataPoint)) {
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

/** A rule of a control: one of its mappings, its rule for an absent data
 * point, or its own for any other value, which alone converts numbers. */
interface Rule extends ControlRule {
  kind: "mapping" | "absent" | "own";
  raw?: DataPointValue;
}

// In the order tuya-local meets them, as near as the entry keeps it: a device
// file puts its rule for any other value last.
function rulesOf(control: ControlTarget): Rule[] {
  return [
    ...(control.values ?? []).map(
      (mapping): Rule => ({ ...mapping, kind: "mapping" }),
    ),
    ...(control.whenAbsent
      ? [{ ...control.whenAbsent, kind: "absent" } as Rule]
      : []),
    ...(hasOwnRule(control) ? [ownRule(control)] : []),
  ];
}

function ownRule(control: ControlTarget): Rule {
  return {
    kind: "own",
    ...(control.otherwise !== undefined && { value: control.otherwise }),
    ...(control.ownRuleReadOnly && { readOnly: true }),
    ...(control.dependsOn && { dependsOn: control.dependsOn }),
    ...(control.redirect && { redirect: control.redirect }),
    ...(control.mirror && { mirror: control.mirror }),
    ...(control.availableWhile && { availableWhile: control.availableWhile }),
  };
}

function hasOwnRule(control: ControlTarget): boolean {
  return (
    control.otherwise !== undefined ||
    control.ownRuleReadOnly !== undefined ||
    control.scale !== undefined ||
    control.step !== undefined ||
    control.invert !== undefined ||
    control.targetRange !== undefined ||
    control.dependsOn !== undefined ||
    control.redirect !== undefined ||
    control.mirror !== undefined ||
    control.availableWhile !== undefined
  );
}

// Source: A mapping or a condition naming an `available` data point applies
// only while that data point's value, as it converts, is truthy, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L578-L585.
function isAvailable(
  entry: TuyaDeviceEntry,
  rule: ControlRule,
  dataPoints: DataPoints,
): boolean {
  if (!rule.availableWhile) {
    return true;
  }
  return isTruthy(readControl(entry, rule.availableWhile, dataPoints));
}

// Source: A raw value falls under the first mapping whose dps_val matches
// it, an absent one, which Python writes as None, under the mapping whose
// dps_val is null or the text None, and any other
// under the rule with no dps_val; a rule that is not available is passed
// over, unless conditions decide it, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L750-L759.
function ruleForRaw(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  value: DataPointValue | undefined,
  dataPoints: DataPoints,
): Rule | undefined {
  const type = fieldType(control, typeOf(entry, control));
  let fallback: Rule | undefined;
  for (const rule of rulesOf(control)) {
    if (!rule.dependsOn && !isAvailable(entry, rule, dataPoints)) {
      continue;
    }
    if (rule.kind === "own") {
      fallback = rule;
    } else if (
      rule.kind === "absent"
        ? value === undefined
        : matches(type, rule.raw as DataPointValue, value)
    ) {
      return rule;
    }
  }
  return fallback;
}

// The value a raw value reads as before any rule: the bits a mask covers,
// decoded text, or a number a device sent as a string. Undefined where it
// does not decode.
function decode(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  raw: DataPointValue | undefined,
): { value: DataPointValue | undefined } | undefined {
  if (raw === undefined) {
    return { value: undefined };
  }
  const type = typeOf(entry, control);
  const value = isMasked(control)
    ? readMask(control, type, raw)
    : type === "utf16b64"
      ? decodeUtf16(raw)
      : numericFromString(type, raw);
  return value === undefined ? undefined : { value };
}

// Source: A raw value takes its rule's value, `null` meaning none, then that
// of the last of the rule's conditions that holds, then the nested mapping's
// of that condition matching the result; a redirect or a mirror reads the
// other data point as it converts; a number then has invert, target_range
// and scale applied, in that order, the scale being the one the raw value's
// rule and its condition give, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L780-L874
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L683-L691.
function readControl(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  dataPoints: DataPoints,
): ControlValue | undefined {
  const raw = dataPoints[control.dataPoint];
  const decoded = decode(entry, control, raw);
  if (!decoded) {
    return undefined;
  }
  const rule = ruleForRaw(entry, control, decoded.value, dataPoints);
  if (!rule) {
    return decoded.value;
  }
  const condition = holdingCondition(entry, rule.dependsOn, dataPoints);
  if (condition?.invalid) {
    return undefined;
  }
  let result: ControlValue | null | undefined = decoded.value;
  if (rule.value !== undefined) {
    result = rule.value;
  }
  if (condition?.value !== undefined) {
    result = condition.value;
  }
  for (const nested of condition?.values ?? []) {
    if (nested.value !== undefined && pyStr(nested.raw) === pyStr(result)) {
      result = nested.value;
    }
  }
  if (result == null && condition?.whenAbsent?.value !== undefined) {
    result = condition.whenAbsent.value;
  }
  const target =
    condition?.redirect ?? rule.redirect ?? condition?.mirror ?? rule.mirror;
  if (target) {
    return readControl(entry, target, dataPoints);
  }
  if (typeof result !== "number") {
    return result ?? undefined;
  }
  const conversion = { ...(rule.kind === "own" ? control : {}), ...condition };
  const { min, max } = control;
  if (conversion.invert && min !== undefined && max !== undefined) {
    result = min + max - result;
  }
  if (conversion.targetRange && max !== undefined) {
    const from = min ?? 0;
    const { min: toMin, max: toMax } = conversion.targetRange;
    result = toMin + ((result - from) * (toMax - toMin)) / (max - from);
  }
  const scale = scaleOf(entry, control, raw, dataPoints);
  return scale === 1 ? result : result / scale;
}

// The scale of the rule the data point's raw value, as the device sent it,
// falls under, and of that rule's condition that holds.
function scaleOf(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  raw: DataPointValue | undefined,
  dataPoints: DataPoints,
): number {
  const rule = ruleForRaw(entry, control, raw, dataPoints);
  const own = rule?.kind === "own" ? control.scale : undefined;
  return (
    holdingCondition(entry, rule?.dependsOn, dataPoints)?.scale ?? own ?? 1
  );
}

// Source: A value written takes the rule tuya-local finds for it: the
// mapping whose value equals it, or whose mirror reads it, or one of whose
// conditions gives it while its constraint can be set or already holds, a
// hidden or unavailable mapping by its conditions alone, else the mapping
// with the nearest number, else the rule with no dps_val unless it is
// hidden. A mapping writes its dps_val; the rule's condition giving the
// value, or else holding, sets the constraint through the constraint's own
// rules, gives its nested mapping's dps_val, its step, redirect,
// target_range and invert. A number is then scaled by the current raw
// value's rule, mapped back from target_range, inverted and rounded to step,
// half to even, either of the two taking a mapping whose value the result
// then is; checked against the current rule's range; set in the mask's bits,
// truncated; and given the data point's type. Where no rule takes the value,
// the current raw value's rule's redirect takes it, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L876-L976
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L978-L1162.
// Where tuya-local would write a value no rule takes as its truthiness, or
// as the text "True", this throws a TypeError: see DESIGN.md#catalog.
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
  const id = control.dataPoint;
  const currentRule = ruleForRaw(entry, control, current[id], current);
  // Source: Where no rule takes the value, the current raw value's rule's
  // redirect takes it before anything else is tried, in
  // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L1000-L1010.
  const found = findRule(
    entry,
    control,
    value,
    current,
    currentRule?.redirect ? "unlessNone" : true,
  );
  if (!found && currentRule?.redirect) {
    writeControl(entry, currentRule.redirect, value, current, dataPoints);
    return;
  }
  // Source: A write is refused while the condition that holds on the rule
  // taking the value is invalid, in
  // https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L568-L576
  // and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L729-L735.
  if (found && holdingCondition(entry, found.dependsOn, current)?.invalid) {
    throw new TuyaError(
      "VALUE_UNAVAILABLE",
      `${value} cannot be set while data point ${found.dependsOn?.dataPoint} is ${String(current[found.dependsOn?.dataPoint ?? ""])}`,
    );
  }
  let result: DataPointValue | null = value;
  let fromRule = false;
  const constraints: Record<string, DataPointValue> = {};
  if (found) {
    const own = found.kind === "own";
    let redirect = found.redirect;
    let step = own ? control.step : undefined;
    let targetRange = own ? control.targetRange : undefined;
    let invert = own ? control.invert : undefined;
    if (!own) {
      result = found.raw ?? null;
      fromRule = true;
    }
    const condition = writingCondition(entry, found.dependsOn, value, current);
    if (condition) {
      const given =
        condition.value ??
        (condition.mirror && readControl(entry, condition.mirror, current));
      if (pyEq(given, value) && found.dependsOn) {
        setConstraint(
          entry,
          control,
          found.dependsOn,
          condition,
          current,
          constraints,
        );
      }
      for (const nested of condition.values ?? []) {
        if (!nested.readOnly && pyEq(nested.value, value)) {
          result = nested.raw;
          fromRule = true;
        }
      }
      step = condition.step ?? step;
      redirect = condition.redirect ?? redirect;
      targetRange = condition.targetRange ?? targetRange;
      invert = condition.invert ?? invert;
    }
    if (redirect) {
      writeControl(entry, redirect, value, current, dataPoints);
      return;
    }
    // A number that lands on a mapping's value writes that mapping's raw
    // value instead.
    const remap = () => {
      const again =
        own && isNumber(result)
          ? findRule(entry, control, result, current, false)
          : undefined;
      if (again?.kind === "mapping" && !again.readOnly) {
        result = again.raw as DataPointValue;
        fromRule = true;
      }
    };
    const scale = scaleOf(entry, control, current[id], current);
    if (scale !== 1 && isNumber(result)) {
      result = Number(result) * scale;
      remap();
    }
    const { min, max } = control;
    if (targetRange && max !== undefined && isNumber(result)) {
      const to = min ?? 0;
      result =
        to +
        ((Number(result) - targetRange.min) * (max - to)) /
          (targetRange.max - targetRange.min);
    }
    if (invert && min !== undefined && max !== undefined && isNumber(result)) {
      result = min + max - Number(result);
    }
    if (step && isNumber(result)) {
      result = step * pyRound(Number(result) / step);
      remap();
    }
  }
  const type = typeOf(entry, control);
  // A boolean that one mapping names leaves its rule with no dps_val the
  // other value alone: see DESIGN.md#catalog.
  if (
    found?.kind === "own" &&
    type === "boolean" &&
    !fromRule &&
    typeof result !== "boolean" &&
    !isMasked(control)
  ) {
    const named = new Set(
      (control.values ?? []).flatMap((mapping) =>
        typeof mapping.raw === "boolean" ? [mapping.raw] : [],
      ),
    );
    if (named.size === 1) {
      result = !named.has(true);
      fromRule = true;
    }
  }
  checkRange(entry, control, currentRule, value, result, current);
  Object.assign(dataPoints, constraints);
  if (!isMasked(control)) {
    dataPoints[id] = rawOfType(control, type, result, fromRule);
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
  if (typeof result === "boolean") {
    result = Number(result);
  }
  if (typeof result !== "number") {
    throw new TypeError(`${value} cannot be set in the bits of a mask`);
  }
  dataPoints[id] = writeMask(control, type, base, result);
}

// Source: Writing a condition's value sets its constraint, where that is
// another data point and the condition names one value of it, to that
// value read and written back through the constraint's own rules, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L1035-L1048.
// A constraint that is read-only, or a condition for its absence, sets
// nothing.
function setConstraint(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  dependency: ControlDependency,
  condition: ControlCondition,
  current: DataPoints,
  dataPoints: Record<string, DataPointValue>,
): void {
  const [raw, ...rest] = condition.when;
  if (
    dependency.readOnly ||
    dependency.dataPoint === control.dataPoint ||
    rest.length > 0 ||
    raw === null ||
    raw === undefined
  ) {
    return;
  }
  const constraint = dependency.constraint;
  if (!constraint) {
    const type = entry.dataPoints[dependency.dataPoint]?.type;
    dataPoints[dependency.dataPoint] = rawOfType(
      { dataPoint: dependency.dataPoint },
      type,
      raw,
      true,
    );
    return;
  }
  const value = readControl(entry, constraint, {
    ...current,
    [dependency.dataPoint]: raw,
  });
  if (value !== undefined) {
    writeControl(entry, constraint, value, current, dataPoints);
  }
}

// The rule a written value falls under, or undefined when no mapping takes
// it and the control has no rule of its own that a write takes. A value
// only a condition on a read-only data point gives, while it does not hold,
// throws where `strict`, or where it is "unlessNone" and another rule takes
// the value.
function findRule(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  value: DataPointValue,
  current: DataPoints,
  strict: boolean | "unlessNone",
): Rule | undefined {
  let fallback: Rule | undefined;
  let nearest: Rule | undefined;
  let distance = Number.POSITIVE_INFINITY;
  let unavailable: ControlDependency | undefined;
  for (const rule of rulesOf(control)) {
    const passedOver = rule.readOnly || !isAvailable(entry, rule, current);
    if (rule.kind === "own" && !passedOver) {
      fallback = rule;
    }
    if (!passedOver && rule.kind === "mapping") {
      if (rule.value != null && pyStr(rule.value) === pyStr(value)) {
        return rule;
      }
      if (isNumber(rule.value) && isNumber(value)) {
        const gap = Math.abs(Number(rule.value) - Number(value));
        if (gap < distance) {
          distance = gap;
          nearest = rule;
        }
      }
      if (
        rule.value === undefined &&
        mirrors(entry, rule.mirror, value, current)
      ) {
        return rule;
      }
    }
    const reach = conditionReach(entry, control, rule, value, current);
    if (reach === "reachable") {
      return rule;
    }
    if (reach === "unavailable") {
      unavailable ??= rule.dependsOn;
    }
  }
  const rule = nearest ?? fallback;
  if (unavailable && (strict === true || (strict && rule))) {
    throw new TuyaError(
      "VALUE_UNAVAILABLE",
      `${value} cannot be set while data point ${unavailable.dataPoint} is ${String(current[unavailable.dataPoint])}`,
    );
  }
  return rule;
}

// Whether one of a rule's conditions gives `value` and can be made to hold,
// because its constraint is another data point that can be set, or its raw
// value already matches.
function conditionReach(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  rule: Rule,
  value: DataPointValue,
  current: DataPoints,
): "reachable" | "unavailable" | undefined {
  const dependency = rule.dependsOn;
  let reach: "unavailable" | undefined;
  for (const condition of dependency?.conditions ?? []) {
    if (condition.readOnly || !isAvailable(entry, condition, current)) {
      continue;
    }
    if (condition.value === undefined) {
      if (mirrors(entry, condition.mirror, value, current)) {
        return "reachable";
      }
      continue;
    }
    if (condition.value === null || pyStr(condition.value) !== pyStr(value)) {
      continue;
    }
    const raw = dependency ? current[dependency.dataPoint] : undefined;
    if (
      (dependency &&
        !dependency.readOnly &&
        dependency.dataPoint !== control.dataPoint) ||
      (raw === undefined
        ? condition.when.includes(null)
        : condition.when.some((when) => pyEq(when, raw)))
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
  value: DataPointValue,
  current: DataPoints,
): boolean {
  if (!mirror) {
    return false;
  }
  const read = readControl(entry, mirror, current);
  return read !== undefined && pyStr(read) === pyStr(value);
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
    (condition) =>
      isAvailable(entry, condition, current) && pyEq(condition.value, value),
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
    if (
      dependency &&
      isAvailable(entry, condition, dataPoints) &&
      holds(entry, dependency, condition, dataPoints)
    ) {
      holding = condition;
    }
  }
  return holding;
}

// Source: A condition holds while its constraint's raw value, or a hex or
// base64 constraint's value as it converts, equals or is in its dps_val,
// while the constraint is absent for a dps_val of null, or on a bitfield while
// every bit of its dps_val is set, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L933-L976.
function holds(
  entry: TuyaDeviceEntry,
  dependency: ControlDependency,
  condition: ControlCondition,
  dataPoints: DataPoints,
): boolean {
  const type = entry.dataPoints[dependency.dataPoint]?.type;
  const constraint = dependency.constraint;
  const constraintType = constraint ? typeOf(entry, constraint) : type;
  const raw =
    constraint && constraintType && PACKED_TYPES.has(constraintType)
      ? readControl(entry, constraint, dataPoints)
      : dataPoints[dependency.dataPoint];
  if (raw === undefined) {
    return condition.when.includes(null);
  }
  return condition.when.some(
    (when) =>
      when !== null &&
      (pyEq(when, raw) ||
        (type === "bitfield" && (Number(raw) & Number(when)) === Number(when))),
  );
}

// Source: A write is checked, rounded half to even, against the range of the
// rule the current raw value falls under, and of its condition that holds,
// in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L662-L681
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L1119-L1128.
function checkRange(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
  currentRule: Rule | undefined,
  value: ControlValue,
  result: DataPointValue | null,
  current: DataPoints,
): void {
  if (!isNumber(result)) {
    return;
  }
  const condition = holdingCondition(entry, currentRule?.dependsOn, current);
  const min = condition?.min ?? control.min;
  const max = condition?.max ?? control.max;
  const rounded = pyRound(Number(result));
  if (
    min !== undefined &&
    max !== undefined &&
    (rounded < min || rounded > max)
  ) {
    throw new RangeError(
      `${value} sets data point ${control.dataPoint} to ${result}, outside ${min} to ${max}`,
    );
  }
}

// Source: A raw value written takes its data point's type: a number rounded
// half to even, a boolean's truthiness, or text as Python writes it, and
// UTF-16 text encoded, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L761-L778.
// A value the caller gave that no rule took, and that does not fit the
// type, throws instead: see DESIGN.md#catalog.
function rawOfType(
  control: ControlTarget,
  type: TuyaDataPointType | undefined,
  result: DataPointValue | null,
  fromRule: boolean,
): DataPointValue {
  const unfit = () =>
    new TypeError(
      `${String(result)} is not a value data point ${control.dataPoint} takes, as a ${type}`,
    );
  if (result === null) {
    throw unfit();
  }
  if (type && NUMERIC_TYPES.has(type)) {
    if (typeof result === "string") {
      throw unfit();
    }
    return pyRound(Number(result));
  }
  if (type === "boolean") {
    if (typeof result !== "boolean" && !fromRule) {
      throw unfit();
    }
    return isTruthy(result);
  }
  if (type === undefined) {
    return result;
  }
  if (typeof result === "boolean" && !fromRule) {
    throw unfit();
  }
  const text = pyStr(result);
  return type === "utf16b64" ? encodeUtf16(text) : text;
}

function matches(
  type: TuyaDataPointType | undefined,
  raw: DataPointValue,
  value: DataPointValue | undefined,
): boolean {
  if (type === "bitfield" && isTruthy(raw)) {
    return (Number(value) & Number(raw)) !== 0;
  }
  return pyStr(raw) === pyStr(value);
}

// Source: A device can send a number as a string, read as the number where
// Python's int() takes it, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L780-L789.
function numericFromString(
  type: TuyaDataPointType | undefined,
  raw: DataPointValue,
): DataPointValue {
  const integer = typeof raw === "string" ? parseInteger(raw) : undefined;
  return integer !== undefined && type && NUMERIC_TYPES.has(type)
    ? integer
    : raw;
}

function typeOf(
  entry: TuyaDeviceEntry,
  control: ControlTarget,
): TuyaDataPointType | undefined {
  return control.type ?? entry.dataPoints[control.dataPoint]?.type;
}

// Source: A utf16b64 value is text in UTF-16, big-endian, as base64, decoded
// before any mapping and read as it came where it does not decode, and
// encoded back for a write, in
// https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L790-L795
// and https://github.com/make-all/tuya-local/blob/860df4ffc25ac619501bd8a8884b3bc83eaa9f35/custom_components/tuya_local/helpers/device_config.py#L770-L773.
function decodeUtf16(raw: DataPointValue): DataPointValue {
  // atob takes base64 without its padding, which Python's b64decode refuses.
  if (typeof raw !== "string" || raw.length % 4 !== 0) {
    return raw;
  }
  try {
    const bytes = Uint8Array.from(atob(raw), (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  } catch {
    return raw;
  }
}

function encodeUtf16(text: string): string {
  let binary = "";
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    binary += String.fromCharCode(unit >> 8, unit & 0xff);
  }
  return btoa(binary);
}
