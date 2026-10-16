import { randomBytes, randomInt } from "node:crypto";
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import type {
  DataPoints,
  DataPointValue,
  ProtocolVersion,
} from "@open-tuya/core";
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
// and 7 is CONTROL, 8 STATUS, 9 HEART_BEAT, 10 DP_QUERY, 13 CONTROL_NEW and 16
// DP_QUERY_NEW in
// https://github.com/codetheweb/tuyapi/commit/a0c412245dfe8aed089d20d4f512aef2348af8da.
const SESS_KEY_NEG_START = 0x03;
const SESS_KEY_NEG_RESP = 0x04;
const SESS_KEY_NEG_FINISH = 0x05;
const CONTROL = 0x07;
const STATUS = 0x08;
const HEART_BEAT = 0x09;
const DP_QUERY = 0x0a;
const CONTROL_NEW = 0x0d;
const DP_QUERY_NEW = 0x10;
const NONCE_LENGTH = 16;
const IV_LENGTH = 12;

export type { ClientFrame };

export interface StartSimulatedDeviceOptions {
  version: ProtocolVersion;
  /** The 16 characters the Tuya cloud gives as the device's local key. */
  localKey: string;
  /** The data points the device holds. A write sets only these. Defaults to
   * none. */
  dataPoints?: DataPoints;
}

/** Starts a device listening on a free port of 127.0.0.1. */
export async function startSimulatedDevice(
  options: StartSimulatedDeviceOptions,
): Promise<SimulatedTuyaDevice> {
  // A device answers each frame at once, so Nagle's algorithm would only
  // hold back the frame after it.
  const server = createServer({ noDelay: true });
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
  /** The data points the device holds, as writes and `report` leave them. */
  readonly dataPoints: Record<string, DataPointValue>;
  /** Defaults to true. */
  answersHeartbeats = true;
  /** Whether a write is followed by a STATUS frame of the data points it set:
   * some devices only ack. Defaults to true. */
  pushesAfterWrite = true;
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
    this.dataPoints = { ...options.dataPoints };
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

  /** Sets `dataPoints` and reports them to the connected client in a STATUS
   * frame, as the device does when a data point changes. It throws when no
   * client is connected. */
  report(dataPoints: DataPoints): void {
    Object.assign(this.dataPoints, dataPoints);
    this.send(STATUS, this.status(dataPoints));
  }

  /** Pushes a frame to the connected client, with return code 0. STATUS gets
   * the version header. It throws when no client is connected. */
  send(command: number, plaintext: Uint8Array): void {
    this.write(this.pushSequenceNumber(), command, 0, plaintext);
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
            0,
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
          this.reply(frame, 0, Buffer.alloc(0));
        }
        return;
      case DP_QUERY:
      case DP_QUERY_NEW:
        this.answerQuery(frame);
        return;
      case CONTROL:
      case CONTROL_NEW:
        this.answerControl(frame);
        return;
    }
  }

  // Source: A device answers a query with its own command: return code 0 and
  // {"dps":…}, or return code 1 and "json obj data unvalid" when it holds no
  // data point, or "data format error" when the query is not JSON, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  private answerQuery(frame: ClientFrame): void {
    if (parseJson(frame.payload) === undefined) {
      this.reply(frame, 1, Buffer.from("data format error"));
    } else if (Object.keys(this.dataPoints).length === 0) {
      this.reply(frame, 1, Buffer.from("json obj data unvalid"));
    } else {
      this.reply(frame, 0, json({ dps: this.dataPoints }));
    }
  }

  // Source: A device acks a write with an empty frame of its own command, or
  // "parse data error" when it is not JSON, or "data format error" when its
  // data has no dps; a 3.5 device sets return code 1 on every ack, and takes
  // the dps from the write's "data", acting on nothing without it, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  // Source: A 3.3 device acks with return code 0, in
  // https://github.com/jasonacox/tinytuya/issues/498#issuecomment-2119361833.
  // What a 3.4 device sends is unknown: see UNSUPPORTED.md.
  // Source: A device sets only the data points it has, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  private answerControl(frame: ClientFrame): void {
    const { version } = this.options;
    const returnCode = version === "3.5" ? 1 : 0;
    const message = parseJson(frame.payload);
    if (message === undefined) {
      this.reply(frame, returnCode, Buffer.from("parse data error"));
      return;
    }
    const data = version === "3.3" ? message : field(message, "data");
    if (data === undefined) {
      this.reply(frame, returnCode, Buffer.alloc(0));
      return;
    }
    const written = field(data, "dps");
    if (!isObject(written)) {
      this.reply(frame, returnCode, Buffer.from("data format error"));
      return;
    }
    const set = Object.fromEntries(
      Object.entries(written).filter(([id]) => id in this.dataPoints),
    ) as DataPoints;
    Object.assign(this.dataPoints, set);
    this.reply(frame, returnCode, Buffer.alloc(0));
    if (this.pushesAfterWrite && Object.keys(set).length > 0) {
      this.send(STATUS, this.status(set));
    }
  }

  // Source: A 3.3 device reports {"dps":…,"t":…}, captured in
  // https://github.com/xZetsubou/hass-localtuya/issues/775, and a 3.4 or 3.5
  // device {"protocol":4,"t":…,"data":{"dps":…}}, captured in
  // https://github.com/jasonacox/tinytuya/discussions/260#discussioncomment-14066063.
  private status(dataPoints: DataPoints): Buffer {
    const t = Math.floor(Date.now() / 1000);
    return this.options.version === "3.3"
      ? json({ dps: dataPoints, t })
      : json({ protocol: 4, t, data: { dps: dataPoints } });
  }

  private reply(
    request: ClientFrame,
    returnCode: number,
    plaintext: Uint8Array,
  ): void {
    this.write(
      this.options.version === "3.3"
        ? request.sequenceNumber
        : this.nextSequenceNumber(),
      request.command === SESS_KEY_NEG_START
        ? SESS_KEY_NEG_RESP
        : request.command,
      returnCode,
      plaintext,
    );
  }

  private pushSequenceNumber(): number {
    return this.options.version === "3.3" ? 0 : this.nextSequenceNumber();
  }

  // Source: A device puts the version header on some of its payloads, as
  // clients look for it in
  // https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6
  // and https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a.
  // Which ones is unknown: see UNSUPPORTED.md.
  private write(
    sequenceNumber: number,
    command: number,
    returnCode: number,
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
          returnCode,
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

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString());
  } catch {
    return undefined;
  }
}

function json(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function field(value: unknown, name: string): unknown {
  return isObject(value) ? value[name] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
