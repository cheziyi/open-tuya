import type {
  ModelType,
  TuyaDeviceModel,
  TuyaModelDataPoint,
} from "@open-tuya/core";
import type { ThingProperty } from "./protocol/records.js";

// Source: A property's typeSpec names its type, `bool`, `value`, `enum`,
// `string`, `raw` or `bitmap` among others, and gives a value's min, max,
// step, unit and scale and an enum's range, in
// https://github.com/tuya/tuya-openclaw-skills/blob/9f3c3bdb4d2063a285dd9a20d0cb4b5dae04e908/tuya-smart-control/references/device-control.md#L97-L129.
const MODEL_TYPES_BY_SPEC: Readonly<Record<string, ModelType>> = {
  bool: "boolean",
  value: "integer",
  enum: "enum",
  string: "string",
  bitmap: "bitmap",
  raw: "raw",
};

/** Describes each property of a thing model by its code and the type and
 * values its typeSpec gives. A property of any other type, such as `float`
 * or `struct`, is left out. */
export function readDeviceModel(
  properties: readonly ThingProperty[],
): TuyaDeviceModel {
  const model: Record<string, TuyaModelDataPoint> = {};
  for (const property of properties) {
    const spec: Record<string, unknown> =
      typeof property.typeSpec === "object" && property.typeSpec !== null
        ? (property.typeSpec as Record<string, unknown>)
        : {};
    const type = Object.hasOwn(MODEL_TYPES_BY_SPEC, String(spec.type))
      ? MODEL_TYPES_BY_SPEC[String(spec.type)]
      : undefined;
    if (type === undefined) {
      continue;
    }
    const { range, min, max, step, scale, unit } = spec;
    model[String(property.abilityId)] = {
      code: property.code,
      type,
      ...(Array.isArray(range) &&
        range.every((value) => typeof value === "string") && { range }),
      ...(Number.isFinite(min) && { min: min as number }),
      ...(Number.isFinite(max) && { max: max as number }),
      ...(Number.isFinite(step) && { step: step as number }),
      ...(Number.isFinite(scale) && { scale: scale as number }),
      ...(typeof unit === "string" && unit !== "" && { unit }),
    };
  }
  return model;
}
