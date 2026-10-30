import {
  MODEL_TYPES,
  type ModelType,
  type TuyaDeviceModel,
  type TuyaModelDataPoint,
} from "@open-tuya/core";
import type { DataPointCodes } from "./dataPointCodes.js";
import type { StatusRelation } from "./protocol/records.js";

// Source: A relation's valueType is Boolean, Integer, Enum, String, Raw or
// Bitmap, in any letter case, and its valueDesc is JSON holding an integer's
// min and an enum's range, in
// https://github.com/tuya/tuya-device-sharing-sdk/blob/170cfd9ee7aefb48c14e27d9ee4a45c6bc6b15c4/tuya_sharing/strategy_repo/default.py#L16-L28.
// Source: The same JSON holds an integer's max, scale, step and unit, as Home
// Assistant reads it from a data point's status range, in
// https://github.com/home-assistant-libs/tuya-device-handlers/blob/140de1bf4618b484b8b814481d101759849d54a8/src/tuya_device_handlers/type_information.py#L298-L314.
/** Describes each data point `codes` maps, by the code the cloud reports it
 * under and the type and values its relation gives. A data point whose type
 * is none of `MODEL_TYPES` is left out. */
export function readDeviceModel(
  relations: readonly StatusRelation[],
  codes: DataPointCodes,
): TuyaDeviceModel {
  const model: Record<string, TuyaModelDataPoint> = {};
  for (const relation of relations) {
    const id = String(relation.dpId);
    const code = codes.statusCodesById.get(id);
    const type = readType(relation.valueType);
    if (code !== undefined && type !== undefined) {
      model[id] = { code, type, ...readValues(relation.valueDesc) };
    }
  }
  return model;
}

function readType(valueType: unknown): ModelType | undefined {
  if (typeof valueType !== "string") {
    return undefined;
  }
  const type = valueType.toLowerCase();
  return MODEL_TYPES.find((known) => known === type);
}

function readValues(
  valueDesc: unknown,
): Omit<TuyaModelDataPoint, "code" | "type"> {
  let spec: unknown;
  try {
    spec = typeof valueDesc === "string" ? JSON.parse(valueDesc) : undefined;
  } catch {
    return {};
  }
  if (typeof spec !== "object" || spec === null) {
    return {};
  }
  const { range, min, max, step, scale, unit } = spec as Record<
    string,
    unknown
  >;
  return {
    ...(Array.isArray(range) &&
      range.every((value) => typeof value === "string") && { range }),
    ...(Number.isFinite(min) && { min: min as number }),
    ...(Number.isFinite(max) && { max: max as number }),
    ...(Number.isFinite(step) && { step: step as number }),
    ...(Number.isFinite(scale) && { scale: scale as number }),
    ...(typeof unit === "string" && unit !== "" && { unit }),
  };
}
