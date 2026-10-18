import { randomBytes } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { type ProtocolVersion, TuyaError } from "@open-tuya/core";
import { COMMANDS } from "./protocol/commands.js";
import type { ReceivedTuyaFrame } from "./protocol/frame.js";
import { decodeMessages, encodeMessage } from "./protocol/message.js";
import {
  buildSessionKeyFinish,
  deriveV34SessionKey,
  deriveV35SessionKey,
  parseSessionKeyResponse,
} from "./protocol/sessionKey.js";
import type { VersionHeaderFields } from "./protocol/versionHeader.js";

// Source: A device listens on TCP port 6668 in
// https://github.com/codetheweb/tuyapi/commit/ae63c2b9009ff2bc333e755b523977c9a6ec287f
// and https://github.com/clach04/python-tuya/commit/25d8b0846d9ca8857c99f9ff4c93a11fe64b9674.
const DEFAULT_PORT = 6668;
const CONNECT_TIMEOUT_IN_MS = 5000;
const SESSION_KEY_TIMEOUT_IN_MS = 10_000;
// Source: A device closes a connection that carries nothing for 30 s, in
// https://github.com/jasonacox/tinytuya/commit/bf1eac1494b7a25a817f5a322228914ba5fb69c3.
const HEARTBEAT_INTERVAL_IN_MS = 10_000;
const MAX_UNANSWERED_HEARTBEATS = 2;
const LOCAL_KEY_LENGTH = 16;
const NONCE_LENGTH = 16;
const IV_LENGTH = 12;
const FIRST_SEQUENCE_NUMBER = 1;

export interface OpenConnectionOptions extends ConnectionListeners {
  host: string;
  /** Defaults to 6668. */
  port?: number;
  version: ProtocolVersion;
  /** The 16 characters the Tuya cloud gives as the device's local key. */
  localKey: string;
}

export interface ConnectionListeners {
  /** Called with every frame the device sends but a heartbeat reply, its
   * payload decrypted and its version header removed. */
  onFrame: (frame: ReceivedTuyaFrame) => void;
  /** Called for a frame left unread: its CRC, HMAC or tag is wrong, or its
   * payload does not decrypt. The connection stays open. */
  onDroppedFrame: (error: TuyaError) => void;
  /** Called once when the connection closes, with no error after `close`.
   * Never called when `openConnection` rejects. */
  onClose: (error?: TuyaError) => void;
}

/** Opens a TCP connection to a device and, on 3.4 and 3.5, agrees a session
 * key with it. It rejects with a `TuyaError` with code `CONNECTION_FAILED`
 * when no connection opens within 5 s, and `SESSION_KEY_NEGOTIATION_FAILED`
 * when the device does not agree a session key within 10 s. It throws a
 * `RangeError` for a local key that is not 16 bytes. */
export async function openConnection(
  options: OpenConnectionOptions,
): Promise<TuyaConnection> {
  const localKey = Buffer.from(options.localKey);
  if (localKey.length !== LOCAL_KEY_LENGTH) {
    throw new RangeError(
      `The local key is ${localKey.length} bytes, not ${LOCAL_KEY_LENGTH}`,
    );
  }
  const socket = await connect(options.host, options.port ?? DEFAULT_PORT);
  if (options.version !== "3.4" && options.version !== "3.5") {
    return new TuyaConnection(socket, options, localKey, FIRST_SEQUENCE_NUMBER);
  }
  const sessionKey = await negotiateSessionKey(
    socket,
    options.version,
    localKey,
  );
  return new TuyaConnection(
    socket,
    options,
    sessionKey,
    FIRST_SEQUENCE_NUMBER + 2,
  );
}

// Source: The client numbers its frames from one counter that the session key
// negotiation shares, in
// https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b,
// https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a
// and https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86.
// Source: A device numbers its replies from a counter of its own, not the
// request's, in
// https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3
// and https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04,
// so a reply is not matched to its request by sequence number.
/** An open TCP connection to one device. Open one with `openConnection`.
 * `await using` closes it at the end of its scope. */
export class TuyaConnection implements AsyncDisposable {
  private buffered: Buffer = Buffer.alloc(0);
  private unansweredHeartbeats = 0;
  private closed = false;
  private socketError: Error | undefined;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly released: Promise<void>;

  constructor(
    private readonly socket: Socket,
    private readonly options: OpenConnectionOptions,
    private readonly key: Buffer,
    private sequenceNumber: number,
  ) {
    this.released = new Promise((resolve) =>
      socket.once("close", () => resolve()),
    );
    socket.on("data", (chunk: Buffer) => this.receive(chunk));
    socket.on("error", (error) => {
      this.socketError = error;
    });
    socket.on("close", () =>
      this.end(
        new TuyaError(
          "CONNECTION_LOST",
          "The connection to the device closed",
          {
            cause: this.socketError,
          },
        ),
      ),
    );
    socket.resume();
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_INTERVAL_IN_MS);
  }

  /** Encrypts `plaintext` and sends it as `command`. On `CONTROL` and
   * `CONTROL_NEW` the version header goes in front, holding `fields`, which
   * default to zeros. It resolves once the bytes are written, not when the
   * device answers. It rejects with a `TuyaError` with code `CONNECTION_LOST`
   * once the connection is closed. */
  async send(
    command: number,
    plaintext: Uint8Array,
    fields?: VersionHeaderFields,
  ): Promise<void> {
    if (this.closed) {
      throw new TuyaError("CONNECTION_LOST", "The connection is closed");
    }
    const bytes = encodeMessage(
      this.options.version,
      {
        sequenceNumber: this.nextSequenceNumber(),
        command,
        payload: plaintext,
      },
      this.key,
      randomBytes(IV_LENGTH),
      fields,
    );
    await new Promise<void>((resolve, reject) =>
      this.socket.write(bytes, (error) =>
        error
          ? reject(
              new TuyaError("CONNECTION_LOST", "The frame was not sent", {
                cause: error,
              }),
            )
          : resolve(),
      ),
    );
  }

  /** Closes the connection, calling `onClose` with no error, and resolves
   * once the socket is released. */
  async close(): Promise<void> {
    this.end();
    await this.released;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private receive(chunk: Buffer): void {
    const decoded = decodeMessages(
      this.options.version,
      Buffer.concat([this.buffered, chunk]),
      this.key,
    );
    this.buffered = decoded.remainder;
    for (const error of decoded.errors) {
      this.options.onDroppedFrame(error);
    }
    for (const frame of decoded.frames) {
      if (frame.command === COMMANDS.HEART_BEAT) {
        this.unansweredHeartbeats = 0;
      } else {
        this.options.onFrame(frame);
      }
      if (this.closed) {
        return;
      }
    }
    if (decoded.malformed) {
      this.end(
        new TuyaError(
          "CONNECTION_LOST",
          "The device sent bytes that are not a frame",
          { cause: decoded.malformed },
        ),
      );
    }
  }

  // Source: A heartbeat carries an empty payload, encrypted as any other, in
  // https://github.com/codetheweb/tuyapi/commit/dab81737a350b3f1b8ea85252cc48f472a651e2d,
  // https://github.com/iRayanKhan/homebridge-tuya/commit/ea1d903fb467dd8c296326db130630308113167a
  // and https://github.com/adrianjagielak/homebridge-tuya-plus/commit/e316a912e5d24d6ad302768d26d5182ed2acef86.
  // Source: A device answers HEART_BEAT with an empty HEART_BEAT in
  // https://github.com/jasonacox/tinytuya/commit/dd3ad7f091a26784b53ac37a5ba896be670f346b.
  private beat(): void {
    if (this.unansweredHeartbeats === MAX_UNANSWERED_HEARTBEATS) {
      this.end(
        new TuyaError(
          "CONNECTION_LOST",
          `The device answered none of the last ${MAX_UNANSWERED_HEARTBEATS} heartbeats`,
        ),
      );
      return;
    }
    this.unansweredHeartbeats += 1;
    // A write that fails closes the socket, and the close reports it.
    this.send(COMMANDS.HEART_BEAT, Buffer.alloc(0)).catch(() => {});
  }

  private nextSequenceNumber(): number {
    const sequenceNumber = this.sequenceNumber;
    this.sequenceNumber = (sequenceNumber + 1) >>> 0;
    return sequenceNumber;
  }

  private end(error?: TuyaError): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.heartbeat);
    this.socket.destroy();
    this.options.onClose(error);
  }
}

function connect(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    // Each frame is a small request whose reply is awaited, so Nagle's
    // algorithm would only hold it back.
    const socket = createConnection({ host, port, noDelay: true });
    const timeout = setTimeout(
      () =>
        socket.destroy(
          new TuyaError(
            "CONNECTION_FAILED",
            `No connection to ${host}:${port} opened within ${CONNECT_TIMEOUT_IN_MS} ms`,
          ),
        ),
      CONNECT_TIMEOUT_IN_MS,
    );
    const onError = (error: Error) => {
      clearTimeout(timeout);
      reject(
        error instanceof TuyaError
          ? error
          : new TuyaError(
              "CONNECTION_FAILED",
              `No connection to ${host}:${port} opened`,
              { cause: error },
            ),
      );
    };
    socket.once("error", onError);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.off("error", onError);
      resolve(socket);
    });
  });
}

// Source: The client sends SESS_KEY_NEG_FINISH and switches to the session key
// at once, as the device sends no reply to it, in
// https://github.com/jasonacox/tinytuya/commit/d0ee0be3d0034bb9d8848dde6054d68d1102bf8b
// and https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
// Source: A device closes the connection on a frame not sealed under its local
// key in
// https://github.com/jasonacox/tinytuya/commit/a474c756c1d310ce452d71a7e1f3f52adff80e64.
function negotiateSessionKey(
  socket: Socket,
  version: "3.4" | "3.5",
  localKey: Buffer,
): Promise<Buffer> {
  const localNonce = randomBytes(NONCE_LENGTH);
  return new Promise((resolve, reject) => {
    let buffered: Buffer = Buffer.alloc(0);
    let socketError: Error | undefined;
    const settle = () => {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const fail = (error: unknown) => {
      settle();
      socket.destroy();
      reject(error);
    };
    const failWith = (message: string, cause?: unknown) =>
      fail(
        new TuyaError(
          "SESSION_KEY_NEGOTIATION_FAILED",
          `${message}: check the local key and the protocol version`,
          { cause },
        ),
      );
    const timeout = setTimeout(
      () =>
        failWith(
          `The device did not answer the session key negotiation within ${SESSION_KEY_TIMEOUT_IN_MS} ms`,
        ),
      SESSION_KEY_TIMEOUT_IN_MS,
    );
    const onError = (error: Error) => {
      socketError = error;
    };
    const onClose = () =>
      failWith(
        "The device closed the connection during the session key negotiation",
        socketError,
      );
    const onData = (chunk: Buffer) => {
      const decoded = decodeMessages(
        version,
        Buffer.concat([buffered, chunk]),
        localKey,
      );
      if (decoded.malformed) {
        failWith(
          "The device sent bytes that are not a frame",
          decoded.malformed,
        );
        return;
      }
      buffered = decoded.remainder;
      const [dropped] = decoded.errors;
      if (dropped) {
        failWith(
          "The device's reply is not sealed under the local key",
          dropped,
        );
        return;
      }
      const reply = decoded.frames.find(
        (frame) => frame.command === COMMANDS.SESS_KEY_NEG_RESP,
      );
      if (!reply) {
        return;
      }
      let remoteNonce: Buffer;
      try {
        remoteNonce = parseSessionKeyResponse(
          reply.payload,
          localNonce,
          localKey,
        );
      } catch (error) {
        fail(error);
        return;
      }
      socket.write(
        encodeMessage(
          version,
          {
            sequenceNumber: FIRST_SEQUENCE_NUMBER + 1,
            command: COMMANDS.SESS_KEY_NEG_FINISH,
            payload: buildSessionKeyFinish(remoteNonce, localKey),
          },
          localKey,
          randomBytes(IV_LENGTH),
        ),
      );
      settle();
      // Paused, the socket holds what the device sends next until the
      // connection takes over reading it.
      socket.pause();
      const derive =
        version === "3.4" ? deriveV34SessionKey : deriveV35SessionKey;
      resolve(derive(localNonce, remoteNonce, localKey));
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    socket.write(
      encodeMessage(
        version,
        {
          sequenceNumber: FIRST_SEQUENCE_NUMBER,
          command: COMMANDS.SESS_KEY_NEG_START,
          payload: localNonce,
        },
        localKey,
        randomBytes(IV_LENGTH),
      ),
    );
  });
}
