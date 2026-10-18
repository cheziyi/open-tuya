// tuya-local is Python, and compares, rounds and writes values as Python
// does: these mirror its str(), ==, round(), int() and truthiness.

export function pyStr(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  return String(value);
}

export function pyEq(a: unknown, b: unknown): boolean {
  if (isNumber(a) && isNumber(b)) {
    return Number(a) === Number(b);
  }
  return (a ?? null) === (b ?? null);
}

/** Rounds half to even. */
export function pyRound(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) {
    return Math.round(value);
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

/** A string as int() reads it, or undefined where int() refuses it. */
export function parseInteger(text: string): number | undefined {
  return /^\s*[-+]?\d+(?:_\d+)*\s*$/.test(text)
    ? Number(text.replaceAll("_", ""))
    : undefined;
}

/** Python counts a boolean as a number. */
export function isNumber(value: unknown): value is number | boolean {
  return typeof value === "number" || typeof value === "boolean";
}

export function isTruthy(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== 0 &&
    value !== ""
  );
}
