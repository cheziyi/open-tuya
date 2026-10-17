export type TuyaErrorCode =
  /** The bytes from the device are not a frame, or a frame's CRC is wrong:
   * reconnect. */
  | "MALFORMED_FRAME"
  /** A payload did not decrypt, or a frame's HMAC or tag is wrong: the local
   * key, the session key or the protocol version is wrong. Also thrown for a
   * cloud response that does not decrypt under its request's key. */
  | "DECRYPTION_FAILED"
  /** The device's reply to the session key negotiation is too short, its HMAC
   * is wrong, or it never came: the local key or the protocol version is
   * wrong. */
  | "SESSION_KEY_NEGOTIATION_FAILED"
  /** No connection to the device or the cloud opened: check the device's IP
   * address and that it is on and on the LAN, or the network's route to the
   * cloud. */
  | "CONNECTION_FAILED"
  /** The device closed the connection, the connection failed, or the device
   * stopped answering heartbeats: open a new connection. Also thrown by a
   * request to a client or an account that is closed. */
  | "CONNECTION_LOST"
  /** The device or the cloud answered a request with an error. The message
   * carries its own text, such as "json obj data unvalid" from a device or
   * "command or value not support" from the cloud. */
  | "REQUEST_REJECTED"
  /** The device or the cloud did not answer a request in time. */
  | "REQUEST_TIMED_OUT"
  /** A UDP port that discovery listens on could not be bound: another
   * program holds it without sharing it. */
  | "DISCOVERY_FAILED"
  /** The QR code expired before the app scanned it: request a new one. */
  | "QR_CODE_EXPIRED"
  /** The cloud no longer takes the session's tokens, even after a refresh:
   * sign in again by QR code. A session used by two programs at once ends
   * this way, as each refresh replaces the tokens the other holds. */
  | "SESSION_EXPIRED"
  /** The cloud refused the request for exceeding its rate limit: wait before
   * sending another. */
  | "RATE_LIMITED"
  /** A write names a data point the cloud cannot map to one of its codes, so
   * nothing was sent. */
  | "UNMAPPED_DATA_POINT";

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
