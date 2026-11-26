import { describe, expect, it } from "vitest";
import {
  REVERSIBLE_CONVERSIONS,
  type ValueConversion,
} from "../conversions.js";

const colour = REVERSIBLE_CONVERSIONS.get("dj_v2_color_alg") as ValueConversion;

describe("dj_v2_color_alg", () => {
  // Source: A light's status, as captured in
  // https://github.com/home-assistant-libs/tuya-device-handlers/commit/ebff6cdb566e793baae65f708cc9225cb39b31ce,
  // and a device's 007803e803e8, as captured in
  // https://github.com/home-assistant-libs/tuya-device-handlers/commit/ef935430e9c871363b4cb5b80092f6e105a27d53.
  it("turns the cloud's JSON text into the device's hex digits", () => {
    expect(colour.toDevice('{"h": 1, "s": 1000, "v": 1000}')).toBe(
      "000103e803e8",
    );
    expect(colour.toDevice('{"h":120,"s":1000,"v":1000}')).toBe("007803e803e8");
    expect(colour.toDevice('{"h":0,"s":0,"v":65535}')).toBe("00000000ffff");
  });

  it("reads no value but JSON text of an h, an s and a v of four hex digits each", () => {
    for (const value of [
      "000103e803e8",
      "{",
      "null",
      "[1,1000,1000]",
      '{"h":1,"s":1000}',
      '{"h":1.5,"s":1000,"v":1000}',
      '{"h":-1,"s":1000,"v":1000}',
      '{"h":65536,"s":1000,"v":1000}',
      '{"h":"1","s":1000,"v":1000}',
      { h: 1, s: 1000, v: 1000 },
      24,
      undefined,
    ]) {
      expect(colour.toDevice(value)).toBeUndefined();
    }
  });

  it("turns the device's hex digits, in either letter case, into the cloud's JSON text", () => {
    expect(colour.toCloud("007803e801f4")).toBe('{"h":120,"s":1000,"v":500}');
    expect(colour.toCloud("00000000FFFF")).toBe('{"h":0,"s":0,"v":65535}');
  });

  it("hands on unchanged a value that is not twelve hex digits", () => {
    for (const value of ["007803e801f", "007803e801f4ff", "red", 120, true]) {
      expect(colour.toCloud(value)).toBe(value);
    }
  });

  it("gives back the device's value after both ways", () => {
    expect(colour.toDevice(colour.toCloud("001703de0017"))).toBe(
      "001703de0017",
    );
  });
});
