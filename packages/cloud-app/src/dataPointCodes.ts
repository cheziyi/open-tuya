import type { StatusRelation } from "./protocol/records.js";

/** How a device's data points map to the cloud's codes. */
export interface DataPointCodes {
  /** The code the cloud reports each data point's value under, by data point
   * ID. */
  statusCodesById: ReadonlyMap<string, string>;
  /** The code a command writes each data point by, by data point ID. */
  commandCodesById: ReadonlyMap<string, string>;
  /** Whether the cloud pushes the device's data points by ID. */
  pushedById: boolean;
}

// Source: The cloud pushes a device's data points by ID, and its relations
// can be trusted, only when every relation supports local and the device is
// not of a custom type, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/32440d2040f47287d5f58253feec12eca7a2a7b3.
// Source: The "default" conversion hands the device's value unchanged to the
// one key of statusFormat, which names the code the cloud reports it under,
// in https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13.
// Source: A command takes statusCode, as the response captured in
// https://github.com/home-assistant/core/issues/162625 shows: a relation with
// statusCode "clear_energy" and statusFormat {"energy_reset":"$"} beside a
// status "energy_reset" and a function "clear_energy".
/** Maps each data point whose value the cloud passes through unchanged:
 * DESIGN.md#cloud-app-data-points says why the others are left out. */
export function mapDataPointCodes(
  relations: readonly StatusRelation[],
  customType: boolean,
): DataPointCodes {
  const pushedById =
    !customType && relations.every((relation) => relation.supportLocal);
  const statusCodesById = new Map<string, string>();
  const commandCodesById = new Map<string, string>();
  if (pushedById) {
    for (const relation of relations) {
      if (relation.valueConvert !== "default") {
        continue;
      }
      const id = String(relation.dpId);
      commandCodesById.set(id, relation.statusCode);
      const statusCode = statusFormatKey(relation.statusFormat);
      if (statusCode !== undefined) {
        statusCodesById.set(id, statusCode);
      }
    }
  }
  return { statusCodesById, commandCodesById, pushedById };
}

function statusFormatKey(statusFormat: string): string | undefined {
  let format: unknown;
  try {
    format = JSON.parse(statusFormat);
  } catch {
    return undefined;
  }
  if (typeof format !== "object" || format === null || Array.isArray(format)) {
    return undefined;
  }
  const keys = Object.keys(format);
  return keys.length === 1 ? keys[0] : undefined;
}
