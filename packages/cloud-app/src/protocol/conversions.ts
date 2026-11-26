import type { DataPointValue } from "@open-tuya/core";

/** Turns a data point's value from the cloud's into the device's and back,
 * for a conversion of the cloud's that loses nothing. */
export interface ValueConversion {
  /** The device's value for the cloud's, or undefined when the cloud's is not
   * one the conversion reads. */
  toDevice(value: unknown): DataPointValue | undefined;
  /** The cloud's value for the device's. A value that is not the device's is
   * handed on unchanged, for the cloud to refuse. */
  toCloud(value: DataPointValue): DataPointValue;
}

const COLOUR_PARTS = ["h", "s", "v"] as const;

// Source: "dj_v2_color_alg" reads the device's value as three numbers of four
// hex digits each, the hue, the saturation and the value, and reports them as
// the JSON text of an object with `h`, `s` and `v`, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13.
// Source: A light's data point 24 has that conversion, and its status reads
// '{"h": 1, "s": 1000, "v": 1000}' under colour_data_v2, as captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/commit/ebff6cdb566e793baae65f708cc9225cb39b31ce.
// Source: A command takes the same JSON text, in
// https://github.com/home-assistant-libs/tuya-device-handlers/commit/b02ff1f414d35f6a6a9e5329dd3441e908fae8a5.
// Source: A device sends the hex digits in lower case, such as 001703de0017,
// as captured in https://github.com/tuya/tuya-home-assistant/issues/591.
const COLOUR_V2: ValueConversion = {
  toDevice(value) {
    let colour: unknown;
    try {
      colour = typeof value === "string" ? JSON.parse(value) : undefined;
    } catch {
      return undefined;
    }
    if (typeof colour !== "object" || colour === null) {
      return undefined;
    }
    const parts = COLOUR_PARTS.map(
      (name) => (colour as Record<string, unknown>)[name],
    );
    return parts.every(isColourPart)
      ? parts.map((part) => part.toString(16).padStart(4, "0")).join("")
      : undefined;
  },
  toCloud(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{12}$/i.test(value)) {
      return value;
    }
    return JSON.stringify(
      Object.fromEntries(
        COLOUR_PARTS.map((name, index) => [
          name,
          Number.parseInt(value.slice(index * 4, index * 4 + 4), 16),
        ]),
      ),
    );
  },
};

function isColourPart(part: unknown): part is number {
  return (
    typeof part === "number" &&
    Number.isInteger(part) &&
    part >= 0 &&
    part <= 0xffff
  );
}

/** The conversions that lose nothing, by the name a relation gives in
 * `valueConvert`: DESIGN.md#cloud-app-data-points says why no other is turned
 * back. */
export const REVERSIBLE_CONVERSIONS: ReadonlyMap<string, ValueConversion> =
  new Map([["dj_v2_color_alg", COLOUR_V2]]);
