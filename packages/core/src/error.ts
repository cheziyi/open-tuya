export type TuyaErrorCode =
  /** The bytes from the device are not a frame, or a frame's CRC is wrong:
   * reconnect. */
  | "MALFORMED_FRAME"
  /** A payload did not decrypt, or a frame's HMAC or tag is wrong: the local
   * key, the session key or the protocol version is wrong. */
  | "DECRYPTION_FAILED"
  /** The device's reply to the session key negotiation is too short, its HMAC
   * is wrong, or it never came: the local key or the protocol version is
   * wrong. */
  | "SESSION_KEY_NEGOTIATION_FAILED"
  /** No connection to the device opened: check its IP address, and that it
   * is on and on the LAN. */
  | "CONNECTION_FAILED"
  /** The device closed the connection, the connection failed, or the device
   * stopped answering heartbeats: open a new connection. */
  | "CONNECTION_LOST"
  /** The device answered a request with an error. The message carries the
   * device's own text, such as "json obj data unvalid". */
  | "REQUEST_REJECTED"
  /** The device did not answer a request in time. */
  | "REQUEST_TIMED_OUT";

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
