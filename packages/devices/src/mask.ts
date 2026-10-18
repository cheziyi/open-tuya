import type { DataPointValue } from "@open-tuya/core";
import type { ControlTarget, TuyaDataPointType } from "./entry.js";

/** A data point's value as one unsigned number, with its length in bytes
 * when it is hex or base64. */
interface PackedValue {
  value: bigint;
  length?: number;
}

export type MaskedControl = ControlTarget & { mask: string };

export function isMasked(control: ControlTarget): control is MaskedControl {
  return control.mask !== undefined;
}

/** The type a masked control's bits are read as: a bitfield's stay a
 * bitfield, and any other's are an integer. */
export function fieldType(
  control: ControlTarget,
  type: TuyaDataPointType | undefined,
): TuyaDataPointType | undefined {
  return isMasked(control) && type !== "bitfield" ? "integer" : type;
}

// Source: A masked value is the data point's bytes, from hex padded to whole
// bytes or from base64, or its integer, read as one number in the control's
// byte order; the bits the mask covers are shifted down to its lowest, and
// read in two's complement over the mask's bit count with mask_signed, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L486-L546
// and https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L91-L95.
/** Reads the bits `control.mask` covers, or `undefined` when the value does
 * not decode. */
export function readMask(
  control: MaskedControl,
  type: TuyaDataPointType | undefined,
  raw: DataPointValue,
): number | undefined {
  const packed = unpack(control, type, raw);
  if (!packed) {
    return undefined;
  }
  const mask = BigInt(`0x${control.mask}`);
  let field = (packed.value & mask) >> shiftOf(mask);
  const bits = bitCount(mask);
  if (control.maskSigned && field >= 1n << (bits - 1n)) {
    field -= 1n << bits;
  }
  return Number(field);
}

// Source: A write keeps the bits outside the mask from the current value,
// writes a boolean as 1 or 0, and encodes the result as the current value
// was: lowercase hex, base64, or an integer, in
// https://github.com/make-all/tuya-local/blob/99183c6d1ad07116265a14ebb46aa8f8f146ee55/custom_components/tuya_local/helpers/device_config.py#L1129-L1161.
// No source shows a device taking a value of another length than its mask,
// so one is refused: see DESIGN.md#catalog.
/** Sets the bits `control.mask` covers in `current` to `raw`. It throws a
 * `RangeError` for a value the bits cannot hold, or a current value of
 * another length than the mask, and a `TypeError` for a current value that
 * does not decode. */
export function writeMask(
  control: MaskedControl,
  type: TuyaDataPointType | undefined,
  current: DataPointValue,
  raw: DataPointValue,
): DataPointValue {
  const packed = unpack(control, type, current);
  if (!packed) {
    throw new TypeError(`${String(current)} is not a value of type ${type}`);
  }
  const maskLength = control.mask.length / 2;
  if (packed.length !== undefined && packed.length !== maskLength) {
    throw new RangeError(
      `The data point holds ${packed.length} bytes, where the mask ${control.mask} covers ${maskLength}`,
    );
  }
  const mask = BigInt(`0x${control.mask}`);
  const bits = bitCount(mask);
  const number = Number(raw);
  if (!Number.isInteger(number)) {
    throw new TypeError(`${String(raw)} cannot be set in the bits of a mask`);
  }
  const field = BigInt(number);
  const [min, max] = control.maskSigned
    ? [-(1n << (bits - 1n)), (1n << (bits - 1n)) - 1n]
    : [0n, (1n << bits) - 1n];
  if (field < min || field > max) {
    throw new RangeError(
      `${field} does not fit the ${bits} bits of the mask ${control.mask}`,
    );
  }
  const value = (packed.value & ~mask) | ((field << shiftOf(mask)) & mask);
  if (packed.length === undefined) {
    return Number(value);
  }
  const bytes = toBytes(value, packed.length, control.littleEndian);
  return type === "hex"
    ? Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    : btoa(String.fromCharCode(...bytes));
}

function unpack(
  control: MaskedControl,
  type: TuyaDataPointType | undefined,
  raw: DataPointValue,
): PackedValue | undefined {
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? { value: BigInt(raw) } : undefined;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  let bytes: number[];
  if (type === "hex") {
    const hex = raw.length % 2 === 0 ? raw : `0${raw}`;
    if (!/^[0-9a-f]*$/i.test(hex)) {
      return undefined;
    }
    bytes = hex.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  } else if (type === "base64") {
    try {
      bytes = Array.from(atob(raw), (character) => character.charCodeAt(0));
    } catch {
      return undefined;
    }
  } else {
    return undefined;
  }
  if (control.littleEndian) {
    bytes.reverse();
  }
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return { value, length: bytes.length };
}

function toBytes(
  value: bigint,
  length: number,
  littleEndian: true | undefined,
): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < length; index++) {
    bytes.unshift(Number((value >> BigInt(index * 8)) & 0xffn));
  }
  return littleEndian ? bytes.reverse() : bytes;
}

function shiftOf(mask: bigint): bigint {
  let shift = 0n;
  while (mask !== 0n && ((mask >> shift) & 1n) === 0n) {
    shift++;
  }
  return shift;
}

function bitCount(mask: bigint): bigint {
  let count = 0n;
  for (let rest = mask; rest !== 0n; rest >>= 1n) {
    count += rest & 1n;
  }
  return count;
}
