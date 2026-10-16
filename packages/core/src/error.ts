export type TuyaErrorCode =
  /** The bytes from the device are not a frame: reconnect. */
  | "MALFORMED_FRAME"
  /** A payload did not decrypt: the local key or the protocol version is
   * wrong. */
  | "DECRYPTION_FAILED";

/** Every failure the open-tuya packages throw. Tell one from another by
 * `code`. */
export class TuyaError extends Error {
  constructor(
    readonly code: TuyaErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TuyaError";
  }
}
