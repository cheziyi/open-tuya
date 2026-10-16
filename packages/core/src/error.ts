export type TuyaErrorCode =
  /** The bytes from the device are not a frame, or a frame's CRC is wrong:
   * reconnect. */
  | "MALFORMED_FRAME"
  /** A payload did not decrypt, or a frame's HMAC or tag is wrong: the local
   * key, the session key or the protocol version is wrong. */
  | "DECRYPTION_FAILED"
  /** The device's reply to the session key negotiation is too short, or its
   * HMAC is wrong: the local key is wrong. */
  | "SESSION_KEY_NEGOTIATION_FAILED";

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
