import { randomBytes, randomInt } from "node:crypto";
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import type { ProtocolVersion } from "@open-tuya/core";
import {
  type ClientFrame,
  openClientFrame,
  sealDeviceFrame,
} from "./protocol/frames.js";
import {
  buildSessionKeyResponse,
  deriveSessionKey,
  isSessionKeyFinish,
} from "./protocol/sessionKey.js";

// Source: Command numbers 3, 4 and 5 negotiate the session key in
// https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e,
// and 8 is STATUS and 9 HEART_BEAT in
// https://github.com/codetheweb/tuyapi/commit/a0c412245dfe8aed089d20d4f512aef2348af8da.
const SESS_KEY_NEG_START = 0x03;
const SESS_KEY_NEG_RESP = 0x04;
const SESS_KEY_NEG_FINISH = 0x05;
const STATUS = 0x08;
const HEART_BEAT = 0x09;
const NONCE_LENGTH = 16;
const IV_LENGTH = 12;

export type { ClientFrame };

export interface StartSimulatedDeviceOptions {
  version: ProtocolVersion;
  /** The 16 characters the Tuya cloud gives as the device's local key. */
  localKey: string;
}

/** Starts a device listening on a free port of 127.0.0.1. */
export async function startSimulatedDevice(
  options: StartSimulatedDeviceOptions,
): Promise<SimulatedTuyaDevice> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return new SimulatedTuyaDevice(server, options);
}

// Source: A device serves one client at a time, and a new client closes the
// old one's connection, in
// https://github.com/jasonacox/tinytuya/commit/e8d6aa45e3a281604c027ef24c408c274ef0fa42.
// Source: On 3.3, a device answers with the request's sequence number, in
// https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3,
// and sends a push with sequence number 0, in
// https://github.com/codetheweb/tuyapi/commit/eea26636928ee1cdaafaa207acc85ac74dc7d5a0.
// Source: On 3.4 and 3.5, a device numbers every frame it sends from a counter
// of its own, which starts anywhere, in
// https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04
// and https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb.
// Source: A 3.4 or 3.5 device closes the connection on a frame not sealed
// under its key, in
// https://github.com/jasonacox/tinytuya/commit/a474c756c1d310ce452d71a7e1f3f52adff80e64.
/** A Tuya device answering the LAN protocol, for tests. */
export class SimulatedTuyaDevice {
  /** Every frame the connected clients sent, in order: decrypted, with the
   * version header removed. */
  readonly received: ClientFrame[] = [];
  /** Defaults to true. */
  answersHeartbeats = true;
  private client: Socket | undefined;
  private sessionKeyAgreed = false;
  private readonly localKey: Buffer;
  private key: Buffer;
  private buffered: Buffer = Buffer.alloc(0);
  private sequenceNumber = 0;
  private deviceNonce: Buffer | undefined;
  private clientNonce: Buffer | undefined;

  constructor(
    private readonly server: Server,
    private readonly options: StartSimulatedDeviceOptions,
  ) {
    this.localKey = Buffer.from(options.localKey);
    this.key = this.localKey;
    server.on("connection", (socket) => this.accept(socket));
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  /** A client is connected and, on 3.4 and 3.5, has agreed a session key. A
   * client's connection can open before the device has accepted it. */
  get ready(): boolean {
    return (
      this.client !== undefined &&
      (this.options.version === "3.3" || this.sessionKeyAgreed)
    );
  }

  /** Pushes a frame to the connected client, with return code 0, as the
   * device does when a data point changes. STATUS gets the version header.
   * It throws when no client is connected. */
  send(command: number, plaintext: Uint8Array): void {
    this.write(
      this.options.version === "3.3" ? 0 : this.nextSequenceNumber(),
      command,
      plaintext,
    );
  }

  /** Closes the connected client's connection, as a device does. */
  disconnect(): void {
    this.client?.destroy();
  }

  async close(): Promise<void> {
    this.disconnect();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private accept(socket: Socket): void {
    this.client?.destroy();
    this.client = socket;
    this.key = this.localKey;
    this.sessionKeyAgreed = false;
    this.buffered = Buffer.alloc(0);
    this.sequenceNumber = randomInt(0x10000);
    this.deviceNonce = undefined;
    this.clientNonce = undefined;
    // A client that resets its connection would otherwise crash the process.
    socket.on("error", () => {});
    socket.on("close", () => {
      if (socket === this.client) {
        this.client = undefined;
      }
    });
    socket.on("data", (chunk: Buffer) => {
      if (socket === this.client) {
        this.receive(chunk);
      }
    });
  }

  // A frame is answered before the next is read: the frame after
  // SESS_KEY_NEG_FINISH, often in the same read, is under the session key.
  private receive(chunk: Buffer): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    for (;;) {
      let opened: ReturnType<typeof openClientFrame>;
      try {
        opened = openClientFrame(this.options.version, this.buffered, this.key);
      } catch {
        // What a 3.3 device sends back is unknown: see UNSUPPORTED.md.
        this.buffered = Buffer.alloc(0);
        if (this.options.version !== "3.3") {
          this.disconnect();
        }
        return;
      }
      if (!opened) {
        return;
      }
      this.buffered = opened.rest;
      this.received.push(opened.frame);
      this.answer(opened.frame);
    }
  }

  private answer(frame: ClientFrame): void {
    const { version } = this.options;
    switch (frame.command) {
      case SESS_KEY_NEG_START:
        if (version !== "3.3") {
          this.clientNonce = frame.payload;
          this.deviceNonce = randomBytes(NONCE_LENGTH);
          this.reply(
            frame,
            SESS_KEY_NEG_RESP,
            buildSessionKeyResponse(
              this.deviceNonce,
              this.clientNonce,
              this.localKey,
            ),
          );
        }
        return;
      case SESS_KEY_NEG_FINISH:
        if (version === "3.3" || !this.deviceNonce || !this.clientNonce) {
          return;
        }
        if (
          !isSessionKeyFinish(frame.payload, this.deviceNonce, this.localKey)
        ) {
          this.disconnect();
          return;
        }
        this.key = deriveSessionKey(
          version,
          this.clientNonce,
          this.deviceNonce,
          this.localKey,
        );
        this.sessionKeyAgreed = true;
        return;
      case HEART_BEAT:
        if (this.answersHeartbeats) {
          this.reply(frame, HEART_BEAT, Buffer.alloc(0));
        }
        return;
    }
  }

  private reply(
    request: ClientFrame,
    command: number,
    plaintext: Uint8Array,
  ): void {
    this.write(
      this.options.version === "3.3"
        ? request.sequenceNumber
        : this.nextSequenceNumber(),
      command,
      plaintext,
    );
  }

  // Source: A device puts the version header on some of its payloads, as
  // clients look for it in
  // https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6
  // and https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a.
  // Which ones is unknown: see UNSUPPORTED.md.
  private write(
    sequenceNumber: number,
    command: number,
    plaintext: Uint8Array,
  ): void {
    if (!this.client) {
      throw new Error("No client is connected");
    }
    this.client.write(
      sealDeviceFrame(
        this.options.version,
        {
          sequenceNumber,
          command,
          returnCode: 0,
          plaintext,
          versionHeader: command === STATUS,
        },
        this.key,
        randomBytes(IV_LENGTH),
      ),
    );
  }

  private nextSequenceNumber(): number {
    const sequenceNumber = this.sequenceNumber;
    this.sequenceNumber = (sequenceNumber + 1) >>> 0;
    return sequenceNumber;
  }
}
