import type { StatusRelation } from "./protocol/records.js";

/** How a device's data points map to the cloud's codes. */
export interface DataPointCodes {
  /** The cloud's code for each data point it maps, by data point ID. */
  byId: ReadonlyMap<string, string>;
  /** Whether the cloud pushes the device's data points by ID. */
  pushedById: boolean;
}

// Source: The cloud pushes a device's data points by ID, and its relations
// can be trusted, only when every relation supports local and the device is
// not of a custom type, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/32440d2040f47287d5f58253feec12eca7a2a7b3.
// Source: The "default" conversion hands the device's value to the code
// unchanged, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13.
/** Maps each data point whose value the cloud passes through unchanged:
 * DESIGN.md#cloud-app-data-points says why the others are left out. */
export function mapDataPointCodes(
  relations: readonly StatusRelation[],
  customType: boolean,
): DataPointCodes {
  const pushedById =
    !customType && relations.every((relation) => relation.supportLocal);
  if (!pushedById) {
    return { byId: new Map(), pushedById };
  }
  return {
    byId: new Map(
      relations
        .filter((relation) => relation.valueConvert === "default")
        .map((relation) => [String(relation.dpId), relation.statusCode]),
    ),
    pushedById,
  };
}
