import { parse, YAMLParseError } from "yaml";
import type {
  ControlMapping,
  TuyaControl,
  TuyaDataPointSpec,
  TuyaDataPointType,
  TuyaDeviceEntry,
} from "../src/entry.js";
import {
  type ControlKind,
  type ControlName,
  MEASURES,
  type Measure,
  type UnitSuffix,
} from "../src/vocabulary.ts";

interface DeviceFile {
  name: string;
  products?: { id?: string }[];
  entities: EntityConfig[];
}

interface EntityConfig {
  entity: string;
  name?: string;
  translation_key?: string;
  translation_only_key?: string;
  translation_placeholders?: Record<string, unknown>;
  class?: string;
  deprecated?: string;
  dps: DataPointConfig[];
}

interface DataPointConfig {
  id: number | string;
  name: string;
  type: string;
  optional?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  range?: { min?: number; max?: number };
  unit?: string;
  mapping?: MappingRule[];
  mask?: string;
  mask_signed?: boolean;
  endianness?: string;
  format?: FormatField[];
  [key: string]: unknown;
}

interface FormatField {
  name: string;
  bytes?: number;
  range?: { min?: number; max?: number };
}

interface MappingRule {
  dps_val?: unknown;
  value?: unknown;
  scale?: number;
  step?: number;
  invert?: boolean;
  target_range?: { min?: number; max?: number };
  hidden?: boolean;
  [key: string]: unknown;
}

export type Conversion =
  | { entry: Omit<TuyaDeviceEntry, "source"> }
  | { unsupported: string };

// The tuya-local features a file can use that this conversion does not, each
// with what it means, in the order a file is reported by.
const UNSUPPORTED_MAPPING_KEYS: Record<string, string> = {
  constraint:
    "`constraint` and `conditions`: a value whose meaning depends on another data point",
  conditions:
    "`constraint` and `conditions`: a value whose meaning depends on another data point",
  value_redirect:
    "`value_redirect` and `value_mirror`: a value read from another data point",
  value_mirror:
    "`value_redirect` and `value_mirror`: a value read from another data point",
  available:
    "`available`: a value offered only while another data point allows it",
  invalid: "`invalid`: a value that cannot be written in some states",
  default: "`default`: the value a bare turn-on writes",
  range: "a mapping's own `range`",
};
const DATA_POINT_TYPES: ReadonlySet<string> = new Set([
  "boolean",
  "integer",
  "string",
  "bitfield",
  "base64",
  "hex",
  "json",
  "unixtime",
]);
const NUMBER_CONVERSIONS = ["scale", "step", "invert", "target_range"];
const PACKED_TYPES: ReadonlySet<string> = new Set(["base64", "hex"]);
const MASKED_TYPES: ReadonlySet<string> = new Set([
  "base64",
  "bitfield",
  "hex",
  "integer",
]);
// Source: A format field of 1, 2 or 4 bytes unpacks as a number, and one of
// 3 bytes as bytes, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L49-L71.
const FORMAT_FIELD_BYTES: ReadonlySet<number> = new Set([1, 2, 4]);
const NUMBER_TYPES: ReadonlySet<string> = new Set([
  "bitfield",
  "integer",
  "unixtime",
]);

// Entities that group several data points into one part of a device.
const COMPOSITE_ENTITIES: ReadonlySet<string> = new Set([
  "alarm_control_panel",
  "camera",
  "climate",
  "cover",
  "fan",
  "humidifier",
  "infrared",
  "lawn_mower",
  "light",
  "lock",
  "media_player",
  "remote",
  "siren",
  "vacuum",
  "valve",
  "water_heater",
]);

// The data point an entity of one data point is about.
const PRIMARY_DATA_POINTS: Record<string, string> = {
  binary_sensor: "sensor",
  button: "button",
  datetime: "value",
  event: "event",
  number: "value",
  select: "option",
  sensor: "sensor",
  switch: "switch",
  text: "value",
};

// Translation keys that say what Home Assistant offers for an entity, not
// which part of the device it is.
const CAPABILITY_KEYS: ReadonlySet<string> = new Set([
  "aircon_extra",
  "extended",
  "fan_with_presets",
  "swing_as_powerlevel",
]);

// A control's name for a composite entity's data point, by entity and
// tuya-local's name for the data point. Any other data point keeps its own
// name.
const COMPOSITE_CONTROLS: Record<string, ControlName> = {
  "light.switch": "on",
  "light.brightness": "brightness",
  "light.color_temp": "colorTemperature",
  "light.rgbhsv": "color",
  "light.named_color": "colorName",
  "light.color_mode": "colorMode",
  "light.effect": "effect",
  "climate.hvac_mode": "hvacMode",
  "climate.hvac_action": "hvacAction",
  "climate.temperature": "targetTemperature",
  "climate.current_temperature": "currentTemperature",
  "climate.target_temp_low": "heatingTargetTemperature",
  "climate.target_temp_high": "coolingTargetTemperature",
  "climate.min_temperature": "minTargetTemperature",
  "climate.max_temperature": "maxTargetTemperature",
  "climate.temperature_unit": "temperatureUnit",
  "climate.preset_mode": "preset",
  "climate.fan_mode": "fanMode",
  "climate.swing_mode": "swingMode",
  "climate.swing_horizontal_mode": "horizontalSwingMode",
  "climate.humidity": "targetHumidity",
  "climate.current_humidity": "currentHumidity",
  "water_heater.operation_mode": "mode",
  "water_heater.temperature": "targetTemperature",
  "water_heater.current_temperature": "currentTemperature",
  "water_heater.min_temperature": "minTargetTemperature",
  "water_heater.max_temperature": "maxTargetTemperature",
  "water_heater.temperature_unit": "temperatureUnit",
  "water_heater.away_mode": "awayMode",
  "fan.switch": "on",
  "fan.speed": "speed",
  "fan.preset_mode": "mode",
  "fan.oscillate": "oscillating",
  "fan.direction": "direction",
  "humidifier.switch": "on",
  "humidifier.humidity": "targetHumidity",
  "humidifier.current_humidity": "currentHumidity",
  "humidifier.mode": "mode",
  "humidifier.action": "action",
  "cover.control": "command",
  "cover.position": "targetPosition",
  "cover.current_position": "currentPosition",
  "cover.tilt_position": "targetTilt",
  "cover.action": "movement",
  "lock.lock": "locked",
  "lock.lock_state": "lockState",
  "valve.valve": "open",
  "valve.current_position": "currentPosition",
  "vacuum.power": "on",
  "vacuum.activate": "cleaning",
  "vacuum.command": "command",
  "vacuum.direction_control": "moveDirection",
  "vacuum.fan_speed": "suction",
  "siren.switch": "on",
  "siren.volume_level": "volume",
  "camera.switch": "on",
  "camera.motion_enable": "motionDetection",
  "camera.record": "recording",
  "media_player.switch": "on",
};

// A control's name for an entity of one data point, by entity and its
// translation key or, with no name or key, its class.
const SIMPLE_CONTROLS: Record<string, ControlName> = {
  "switch/": "on",
  "lock/child_lock": "childLock",
  "binary_sensor/class:problem": "fault",
  "sensor/class:temperature": "temperature",
  "sensor/class:humidity": "humidity",
  "sensor/class:battery": "battery",
  "sensor/class:power": "power",
  "sensor/class:energy": "energy",
  "sensor/class:voltage": "voltage",
  "sensor/class:current": "current",
};

// Source: A climate entity's temperatures share one unit: the one its unit
// data point reports, or else the first of these data points that names one,
// or else Celsius, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/climate.py#L127-L156.
const TEMPERATURE_UNIT_DATA_POINTS = [
  "temperature",
  "target_temp_high",
  "target_temp_low",
  "current_temperature",
];

// Home Assistant takes a climate or humidifier entity's humidity as a
// percentage, whatever its data point says.
const HUMIDITY_CONTROLS: ReadonlySet<string> = new Set<ControlName>([
  "currentHumidity",
  "targetHumidity",
]);

// The control a data point is read-only on, besides a sensor's: what a device
// measures or reports.
const READ_ONLY_CONTROLS: ReadonlySet<string> = new Set<ControlName>([
  "action",
  "currentHumidity",
  "currentPosition",
  "currentTemperature",
  "hvacAction",
  "lockState",
  "movement",
]);

const READ_ONLY_ENTITIES: ReadonlySet<string> = new Set([
  "binary_sensor",
  "event",
  "sensor",
]);

// A light's colour field, by tuya-local's name for it. Any other field is
// named for its data point and its own name.
const COLOR_FIELDS: Record<string, ControlName> = {
  h: "hue",
  s: "saturation",
  v: "colorBrightness",
  r: "red",
  g: "green",
  b: "blue",
};

// Source: A switch or a binary sensor is on while its data point's value is
// truthy, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/switch.py#L58-L63,
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/binary_sensor.py#L64-L66
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/light.py#L154-L157,
// so masked bits with no mapping read as a boolean.
const BOOLEAN_DATA_POINTS: ReadonlySet<string> = new Set([
  "binary_sensor.sensor",
  "switch",
]);

// The kind of control an entity of one data point is, by entity.
const SIMPLE_KINDS: Record<string, ControlKind> = {
  binary_sensor: "sensor",
  button: "button",
  datetime: "text",
  event: "event",
  lock: "switch",
  number: "number",
  select: "select",
  sensor: "sensor",
  switch: "switch",
  text: "text",
  time: "number",
};

// The entities whose class says what they measure or detect.
const MEASURING_ENTITIES: ReadonlySet<string> = new Set([
  "binary_sensor",
  "number",
  "sensor",
]);

// Classes that say nothing of what is measured.
const UNMEASURED_CLASSES: ReadonlySet<string> = new Set([
  "enum",
  "measurement",
]);

// What a composite entity's control measures, by its name.
const COMPOSITE_MEASURES: Partial<Record<ControlName, Measure>> = {
  coolingTargetTemperature: "temperature",
  currentHumidity: "humidity",
  currentTemperature: "temperature",
  heatingTargetTemperature: "temperature",
  maxTargetTemperature: "temperature",
  minTargetTemperature: "temperature",
  targetHumidity: "humidity",
  targetTemperature: "temperature",
};

// The unit a time entity's data point carries, by its name.
const TIME_UNITS: Record<string, string> = {
  hour: "h",
  minute: "min",
  second: "s",
};

// Name suffixes for the units tuya-local writes most: AGENTS.md spells a unit
// after `In`, abbreviating only where the abbreviation is well known.
const UNIT_SUFFIXES: Record<string, UnitSuffix> = {
  C: "C",
  "°C": "C",
  "℃": "C",
  F: "F",
  "°F": "F",
  K: "K",
  "%": "Percent",
  s: "Seconds",
  min: "Minutes",
  minutes: "Minutes",
  h: "Hours",
  hour: "Hours",
  d: "Days",
  days: "Days",
  ms: "Ms",
  V: "V",
  v: "V",
  mV: "Millivolts",
  mv: "Millivolts",
  A: "A",
  mA: "Milliamps",
  W: "W",
  kW: "Kw",
  Wh: "Wh",
  kWh: "Kwh",
  Hz: "Hz",
  ppm: "Ppm",
  ppb: "Ppb",
  lx: "Lux",
  ugm3: "UgPerM3",
  "µg/m³": "UgPerM3",
  "μg/m³": "UgPerM3",
  Ω: "Ohms",
  portions: "Portions",
};

/** Converts one tuya-local device file, or names the feature it uses that
 * the catalog does not convert. */
export function convertDeviceFile(text: string): Conversion {
  let file: DeviceFile;
  try {
    file = parse(text) as DeviceFile;
  } catch (error) {
    if (error instanceof YAMLParseError) {
      return { unsupported: "not valid YAML 1.2" };
    }
    throw error;
  }
  const reason = unsupportedFeature(file);
  if (reason) {
    return { unsupported: reason };
  }
  return {
    entry: {
      name: file.name,
      productKeys: (file.products ?? []).flatMap((product) =>
        product.id ? [String(product.id)] : [],
      ),
      dataPoints: dataPointSpecs(file),
      components: components(file),
    },
  };
}

function unsupportedFeature(file: DeviceFile): string | undefined {
  const reasons = new Set<string>();
  const types = new Map<string, string>();
  for (const entity of file.entities) {
    for (const dp of entity.dps) {
      if (!DATA_POINT_TYPES.has(dp.type)) {
        reasons.add(`\`${dp.type}\`: a data point of that type`);
      }
      const typed = types.get(String(dp.id));
      if (typed !== undefined && typed !== dp.type) {
        reasons.add("one data point given two types");
      }
      types.set(String(dp.id), dp.type);
      const reason = unsupportedPacking(entity, dp);
      if (reason) {
        reasons.add(reason);
      }
      const rules = dp.mapping ?? [];
      if (rules.filter((rule) => !("dps_val" in rule)).length > 1) {
        reasons.add("more than one default mapping");
      }
      for (const rule of rules) {
        for (const key of Object.keys(rule)) {
          const reason = UNSUPPORTED_MAPPING_KEYS[key];
          if (reason) {
            reasons.add(reason);
          }
        }
        if (
          "dps_val" in rule &&
          NUMBER_CONVERSIONS.some((key) => key in rule)
        ) {
          reasons.add("a number conversion on one raw value");
        }
      }
    }
  }
  return [...reasons].sort()[0];
}

function unsupportedPacking(
  entity: EntityConfig,
  dp: DataPointConfig,
): string | undefined {
  if (dp.format) {
    if (entity.entity !== "light") {
      return "`format` outside a light";
    }
    if (!PACKED_TYPES.has(dp.type)) {
      return "`format` on a data point that is not hex or base64";
    }
    if (dp.format.some((field) => !FORMAT_FIELD_BYTES.has(field.bytes ?? 1))) {
      return "a `format` field of other than 1, 2 or 4 bytes";
    }
  }
  if (
    dp.endianness !== undefined &&
    !["big", "little"].includes(dp.endianness)
  ) {
    return "an `endianness` other than big or little";
  }
  if (dp.mask === undefined || !isControl(dp)) {
    return undefined;
  }
  if (typeof dp.mask !== "string" || !/^[0-9A-Fa-f]+$/.test(dp.mask)) {
    return "a `mask` that is not a string of hex digits";
  }
  if (!MASKED_TYPES.has(dp.type)) {
    return "`mask` on a data point that is not hex, base64 or an integer";
  }
  const writable = !dp.readonly && !READ_ONLY_ENTITIES.has(entity.entity);
  if (writable && dp.mask.length % 2 !== 0) {
    return "a `mask` of an odd number of hex digits on a control that can be written";
  }
  return undefined;
}

function dataPointSpecs(file: DeviceFile): Record<string, TuyaDataPointSpec> {
  const specs: Record<string, TuyaDataPointSpec> = {};
  const required = new Set<string>();
  for (const entity of file.entities) {
    for (const dp of entity.dps) {
      const id = String(dp.id);
      if (!dp.optional) {
        required.add(id);
      }
      specs[id] = { type: dp.type as TuyaDataPointType };
    }
  }
  for (const [id, spec] of Object.entries(specs)) {
    if (!required.has(id)) {
      spec.optional = true;
    }
  }
  return Object.fromEntries(
    Object.entries(specs).sort(([a], [b]) => Number(a) - Number(b)),
  );
}

function components(
  file: DeviceFile,
): Record<string, Record<string, TuyaControl>> {
  const entities = file.entities.filter((entity) => !entity.deprecated);
  const isComposite = (entity: EntityConfig) =>
    COMPOSITE_ENTITIES.has(entity.entity) &&
    !(entity.entity === "lock" && entity.translation_key === "child_lock");
  const main = entities.find(
    (entity) => isComposite(entity) && !entity.name && !entity.translation_key,
  );
  const result: Record<string, Record<string, TuyaControl>> = {};
  const mainName = main ? camelCase(main.entity) : "device";
  const unitSelect = entities.some(
    (entity) =>
      entity.entity === "select" &&
      entity.translation_key === "temperature_unit",
  );
  for (const entity of entities) {
    let componentName = mainName;
    if (isComposite(entity) && entity !== main) {
      componentName = unique(result, camelCase(componentKey(entity)));
    }
    result[componentName] ??= {};
    const component = result[componentName];
    if (isComposite(entity)) {
      addCompositeControls(component, entity, unitSelect && entity === main);
    } else {
      addSimpleControls(component, entity);
    }
  }
  for (const [name, controls] of Object.entries(result)) {
    if (Object.keys(controls).length === 0) {
      delete result[name];
    }
  }
  return result;
}

function addCompositeControls(
  component: Record<string, TuyaControl>,
  entity: EntityConfig,
  unitSelect: boolean,
): void {
  const runtimeUnit =
    (entity.entity === "climate" || entity.entity === "water_heater") &&
    (unitSelect || entity.dps.some((dp) => dp.name === "temperature_unit"));
  const temperatureUnit = TEMPERATURE_UNIT_DATA_POINTS.map(
    (name) => entity.dps.find((dp) => dp.name === name)?.unit,
  ).find((unit) => unit !== undefined);
  for (const dp of entity.dps) {
    if (!isControl(dp)) {
      continue;
    }
    if (dp.format) {
      addFormatControls(component, entity, dp, dp.format);
      continue;
    }
    const base =
      COMPOSITE_CONTROLS[`${entity.entity}.${dp.name}`] ?? camelCase(dp.name);
    const temperature =
      /temperature$/i.test(base) && base !== "colorTemperature";
    const unitFrom = runtimeUnit && temperature ? "temperatureUnit" : undefined;
    let unit = dp.unit;
    if (unit === undefined && temperature && !runtimeUnit) {
      unit = temperatureUnit ?? "C";
    }
    if (unit === undefined && HUMIDITY_CONTROLS.has(base)) {
      unit = "%";
    }
    const measures = COMPOSITE_MEASURES[base as ControlName];
    addControl(
      component,
      base,
      kelvin(entity, { ...dp, ...(unit !== undefined && { unit }) }),
      entity,
      { ...(unitFrom && { unitFrom }), ...(measures && { measures }) },
    );
  }
}

// Source: A format packs fields of 1, 2 or 4 bytes one after another,
// big-endian, each signed when its range starts below 0 and otherwise
// running over every value its bytes hold, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L450-L474
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/light.py#L210-L228.
// Each field becomes a control over the bytes it covers.
function addFormatControls(
  component: Record<string, TuyaControl>,
  entity: EntityConfig,
  dp: DataPointConfig,
  fields: readonly FormatField[],
): void {
  const length = fields.reduce((sum, field) => sum + (field.bytes ?? 1), 0);
  let offset = 0;
  for (const field of fields) {
    const bytes = field.bytes ?? 1;
    const mask =
      "00".repeat(offset) +
      "FF".repeat(bytes) +
      "00".repeat(length - offset - bytes);
    offset += bytes;
    const fieldName =
      COLOR_FIELDS[field.name] ?? camelCase(`color_${field.name}`);
    const min = field.range?.min ?? 0;
    const max = field.range?.max ?? 256 ** bytes - 1;
    addControl(
      component,
      dp.name === "rgbhsv"
        ? fieldName
        : camelCase(dp.name) +
            fieldName.charAt(0).toUpperCase() +
            fieldName.slice(1),
      {
        id: dp.id,
        name: dp.name,
        type: dp.type,
        ...(dp.readonly && { readonly: true }),
        range: { min, max },
        mask,
        ...(min < 0 && { mask_signed: true }),
      },
      entity,
      { kind: "number" },
    );
  }
}

// Source: A light's colour temperature with a target_range reads in kelvin,
// which Home Assistant takes it in, in
// https://github.com/make-all/tuya-local/commit/1764d0c3764fe882788de59d86929e17b2f5f76f.
function kelvin(entity: EntityConfig, dp: DataPointConfig): DataPointConfig {
  const ranged = (dp.mapping ?? []).some(
    (rule) => !("dps_val" in rule) && rule.target_range,
  );
  return entity.entity === "light" && dp.name === "color_temp" && ranged
    ? { ...dp, unit: "K" }
    : dp;
}

function addSimpleControls(
  component: Record<string, TuyaControl>,
  entity: EntityConfig,
): void {
  const base = simpleBase(entity);
  const primary = PRIMARY_DATA_POINTS[entity.entity];
  const kind = SIMPLE_KINDS[entity.entity];
  const measures = entityMeasures(entity);
  const unitDp = entity.dps.find((dp) => dp.name === "unit" && isControl(dp));
  const unitName = unitDp ? `${base}Unit` : undefined;
  for (const dp of entity.dps) {
    if (!isControl(dp)) {
      continue;
    }
    if (entity.entity === "time" && TIME_UNITS[dp.name]) {
      addControl(
        component,
        base,
        { ...dp, unit: TIME_UNITS[dp.name] },
        entity,
        {
          ...(kind && { kind }),
        },
      );
    } else if (
      dp.name === primary ||
      (entity.entity === "lock" && dp.name === "lock")
    ) {
      addControl(component, base, dp, entity, {
        ...(unitName && { unitFrom: unitName }),
        ...(kind && { kind }),
        ...(measures && { measures }),
      });
    } else if (dp === unitDp && unitName) {
      addControl(component, unitName, dp, entity, {});
    } else {
      addControl(component, join(base, dp.name), dp, entity, {});
    }
  }
}

// What an entity measures or detects, by its class: the catalog's own words,
// so a class tuya-local adds stops the run until MEASURES names it.
function entityMeasures(entity: EntityConfig): Measure | undefined {
  if (
    !entity.class ||
    !MEASURING_ENTITIES.has(entity.entity) ||
    UNMEASURED_CLASSES.has(entity.class)
  ) {
    return undefined;
  }
  const measures = camelCase(entity.class);
  if (!(MEASURES as readonly string[]).includes(measures)) {
    throw new Error(`Add "${measures}" to MEASURES in src/vocabulary.ts`);
  }
  return measures as Measure;
}

function simpleBase(entity: EntityConfig): string {
  if (entity.name) {
    return camelCase(entity.name);
  }
  const key = translationKey(entity);
  if (key) {
    return SIMPLE_CONTROLS[`${entity.entity}/${key}`] ?? camelCase(key);
  }
  const unnamed = SIMPLE_CONTROLS[`${entity.entity}/`];
  if (unnamed) {
    return unnamed;
  }
  if (entity.class) {
    return (
      SIMPLE_CONTROLS[`${entity.entity}/class:${entity.class}`] ??
      camelCase(entity.class)
    );
  }
  return camelCase(entity.entity);
}

function componentKey(entity: EntityConfig): string {
  const key = translationKey(entity);
  if (key && !CAPABILITY_KEYS.has(key)) {
    return key;
  }
  return entity.name ?? entity.entity;
}

// A key ending in `_x` names one of several, with `x` among its placeholders:
// `valve_x` with `x: 1` is the first valve.
function translationKey(entity: EntityConfig): string | undefined {
  const key = entity.translation_key ?? entity.translation_only_key;
  const placeholder = entity.translation_placeholders?.x;
  if (key?.endsWith("_x") && placeholder !== undefined) {
    return `${key.slice(0, -1)}${placeholder}`;
  }
  return key;
}

function isControl(dp: DataPointConfig): boolean {
  return !dp.hidden && dp.name !== "available" && !/^unknown/.test(dp.name);
}

function addControl(
  component: Record<string, TuyaControl>,
  base: string,
  dp: DataPointConfig,
  entity: EntityConfig,
  options: { unitFrom?: string; kind?: ControlKind; measures?: Measure },
): void {
  const { unitFrom } = options;
  const name = unique(
    component,
    unitFrom || dp.unit === undefined
      ? base
      : `${base}In${unitSuffix(dp.unit)}`,
  );
  const readOnly =
    dp.readonly ||
    READ_ONLY_ENTITIES.has(entity.entity) ||
    READ_ONLY_CONTROLS.has(base);
  const rules = dp.mapping ?? [];
  const values: ControlMapping[] = [];
  let absent: unknown;
  const conversion: Partial<TuyaControl> = {};
  for (const rule of rules) {
    if ("dps_val" in rule) {
      if (!("value" in rule) || rule.value === null) {
        continue;
      }
      if (rule.dps_val === null) {
        absent = rule.value;
      } else {
        values.push({
          raw: rule.dps_val as ControlMapping["raw"],
          value: rule.value as ControlMapping["value"],
          ...(rule.hidden && { readOnly: true as const }),
        });
      }
      continue;
    }
    if ("value" in rule && rule.value !== null) {
      conversion.otherwise = rule.value as TuyaControl["otherwise"];
    }
    if (typeof rule.scale === "number" && rule.scale !== 1) {
      conversion.scale = rule.scale;
    }
    if (typeof rule.step === "number") {
      conversion.step = rule.step;
    }
    if (rule.invert) {
      conversion.invert = true;
    }
    if (rule.target_range?.max !== undefined) {
      conversion.targetRange = {
        min: rule.target_range.min ?? 0,
        max: rule.target_range.max,
      };
    }
  }
  const masked = dp.mask !== undefined;
  const booleanMask =
    masked &&
    values.length === 0 &&
    conversion.otherwise === undefined &&
    (BOOLEAN_DATA_POINTS.has(dp.name) ||
      BOOLEAN_DATA_POINTS.has(`${entity.entity}.${dp.name}`));
  if (booleanMask) {
    values.push({ raw: 0, value: false }, { raw: 1, value: true });
    conversion.otherwise = true;
  }
  // A masked data point's bits are read as an integer.
  const type = masked && dp.type !== "bitfield" ? "integer" : dp.type;
  const kind: ControlKind =
    options.kind ??
    (readOnly
      ? "sensor"
      : booleanMask
        ? "switch"
        : values.length > 0
          ? "select"
          : type === "boolean"
            ? "switch"
            : NUMBER_TYPES.has(type)
              ? "number"
              : "text");
  component[name] = {
    dataPoint: String(dp.id),
    ...(masked && { mask: String(dp.mask) }),
    ...(dp.mask_signed && { maskSigned: true as const }),
    ...(dp.endianness === "little" && { littleEndian: true as const }),
    kind,
    ...(options.measures && { measures: options.measures }),
    ...(readOnly && { readOnly: true as const }),
    ...(dp.unit !== undefined && { unit: String(dp.unit) }),
    ...(unitFrom && { unitFrom }),
    ...(dp.range?.min !== undefined && { min: dp.range.min }),
    ...(dp.range?.max !== undefined && { max: dp.range.max }),
    ...(values.length > 0 && { values }),
    ...(absent !== undefined && {
      absent: absent as TuyaControl["absent"],
    }),
    ...conversion,
  };
}

// Joins a control's name to its data point's, once where the one ends in the
// word the other starts with: `fault` and `fault_code` make `faultCode`.
function join(base: string, name: string): string {
  const [last = ""] = words(base.replace(/([A-Z])/g, " $1")).slice(-1);
  const pascal = pascalCase(name);
  if (pascal.toLowerCase().startsWith(last.toLowerCase())) {
    const head = base.slice(0, base.length - last.length);
    return head ? head + pascal : camelCase(name);
  }
  return base + pascal;
}

function unique(taken: Record<string, unknown>, name: string): string {
  if (!(name in taken)) {
    return name;
  }
  let index = 2;
  while (`${name}${index}` in taken) {
    index++;
  }
  return `${name}${index}`;
}

function unitSuffix(unit: string): string {
  return (
    UNIT_SUFFIXES[unit] ??
    pascalCase(
      unit
        .replaceAll("/", " per ")
        .replaceAll("%", " percent ")
        .replaceAll("£", " pounds ")
        .replaceAll("°", " degrees ")
        .replaceAll("℃", " c ")
        .replace(/[µμ]/g, "u")
        .replaceAll("²", "2")
        .replaceAll("³", "3"),
    )
  );
}

function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function camelCase(text: string): string {
  const [first = "", ...rest] = words(text);
  return first.toLowerCase() + rest.map(capitalize).join("");
}

function pascalCase(text: string): string {
  return words(text).map(capitalize).join("");
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
