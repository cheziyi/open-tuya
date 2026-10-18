import { randomBytes, randomInt } from "node:crypto";
import { createSocket, type Socket as UdpSocket } from "node:dgram";
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import {
  type DataPoints,
  type DataPointValue,
  type ProtocolVersion,
  TuyaError,
} from "@open-tuya/core";
import { openDiscoveryRequest, sealBroadcast } from "./protocol/broadcast.js";
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
// Source: 0x40 is LAN_EXT_STREAM, which carries a gateway's sub-device
// status, in
// https://github.com/jasonacox/tinytuya/commit/92bcfc53740f1aa9a9e2ce265d5636120f2228e5.
const LAN_EXT_STREAM = 0x40;
const NONCE_LENGTH = 16;
const IV_LENGTH = 12;
// Source: A 3.5 device answers a request to UDP port 7000, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
const DEFAULT_ANSWER_PORT = 7000;
// Source: A device serves 3 clients at once, and closes the connection of a
// client past them, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
const MAX_CLIENTS = 3;
// Source: A device closes a connection that carries no frame for 30 s, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1
// and https://github.com/jasonacox/tinytuya/commit/bf1eac1494b7a25a817f5a322228914ba5fb69c3.
const IDLE_TIMEOUT_IN_MS = 30_000;

export type { ClientFrame };

export interface StartSimulatedDeviceOptions {
  version: ProtocolVersion;
  /** The 16 characters the Tuya cloud gives as the device's local key. */
  localKey: string;
  /** The data points the device holds. A write sets only these. Defaults to
   * none. */
  dataPoints?: DataPoints;
  /** The ID Tuya calls `gwId`, which the device broadcasts. Defaults to 22
   * random hex characters. */
  deviceId?: string;
  /** Defaults to 16 random hex characters. */
  productKey?: string;
  /** The UDP port a 3.5 device answers a discovery request to. Defaults to
   * 7000. */
  answerPort?: number;
  /** The address the device broadcasts as its own, such as one a client
   * maps to the device's port. Defaults to 127.0.0.1, which it listens on. */
  ip?: string;
  /** The data points of each device behind the gateway the device is, by
   * node ID. Defaults to none. */
  subDevices?: Readonly<Record<string, DataPoints>>;
}

/** Starts a device listening on free ports of 127.0.0.1: TCP for a client,
 * and UDP for a discovery request. */
export async function startSimulatedDevice(
  options: StartSimulatedDeviceOptions,
): Promise<SimulatedTuyaDevice> {
  // A device answers each frame at once, so Nagle's algorithm would only
  // hold back the frame after it.
  const server = createServer({ noDelay: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const discoverySocket = createSocket("udp4");
  await new Promise<void>((resolve) =>
    discoverySocket.bind(0, "127.0.0.1", resolve),
  );
  return new SimulatedTuyaDevice(server, discoverySocket, options);
}

// Source: On 3.1, a device answers with the request's sequence number, and
// a heartbeat and a push with sequence number 0, captured in
// https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765
// and https://github.com/TuyaAPI/cli/issues/80.
// Source: On 3.3, a device answers with the request's sequence number, in
// https://github.com/jasonacox/tinytuya/commit/a2486e834cefeec85da7fb012136d9235acc50b3,
// and sends a push with sequence number 0, captured in
// https://github.com/TuyaAPI/cli/issues/109#issuecomment-767903303.
// Source: On 3.4 and 3.5, a device numbers every frame it sends from a counter
// of its own, which starts anywhere, in
// https://github.com/rospogrigio/localtuya/commit/957cf25dd0af995c496a5644c7a773b46a426b04
// and https://github.com/codetheweb/tuyapi/commit/e125a2e17f3043ed6263f092d154c72bf6d1ecdb.
// Source: A device numbers the version headers it writes from a serial that
// starts anywhere, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
// Source: A 3.4 or 3.5 device closes the connection on a frame not sealed
// under its key, in
// https://github.com/jasonacox/tinytuya/commit/a474c756c1d310ce452d71a7e1f3f52adff80e64.
// Source: A 3.5 device closes the connection on a frame whose sequence number
// is not above the last one the client sent, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
/** A Tuya device answering the LAN protocol, for tests. It serves 3 clients
 * at once, closes the connection of a fourth, and closes a connection that
 * carries no frame for 30 s. `await using` closes it at the end of its
 * scope. */
export class SimulatedTuyaDevice implements AsyncDisposable {
  /** Every frame the connected clients sent, in order: decrypted, with the
   * version header removed. */
  readonly received: ClientFrame[] = [];
  /** The data points the device holds, as writes and `report` leave them. */
  readonly dataPoints: Record<string, DataPointValue>;
  /** The data points each device behind the gateway holds, by node ID, as
   * writes and `report` leave them. */
  readonly subDevices: Record<string, Record<string, DataPointValue>>;
  /** The node IDs the gateway reports offline. A read of one fails. */
  readonly offline = new Set<string>();
  /** Defaults to true. */
  answersHeartbeats = true;
  /** Whether a write is followed by a STATUS frame of the data points it set:
   * some devices only ack. Defaults to true. */
  pushesAfterWrite = true;
  /** Whether a read is answered with return code 1 and "json obj data
   * unvalid", as some devices answer one: the device is then read by writing
   * null to its data points. Defaults to false. */
  refusesReads = false;
  readonly deviceId: string;
  readonly productKey: string;
  private readonly uuid = randomBytes(8).toString("hex");
  private readonly sessions = new Set<Session>();
  private readonly localKey: Buffer;
  private headerSerialNumber = randomInt(0x10000);
  private closing: Promise<void> | undefined;

  constructor(
    private readonly server: Server,
    private readonly discoverySocket: UdpSocket,
    private readonly options: StartSimulatedDeviceOptions,
  ) {
    this.localKey = Buffer.from(options.localKey);
    this.dataPoints = { ...options.dataPoints };
    this.subDevices = Object.fromEntries(
      Object.entries(options.subDevices ?? {}).map(([nodeId, dataPoints]) => [
        nodeId,
        { ...dataPoints },
      ]),
    );
    this.deviceId = options.deviceId ?? randomBytes(11).toString("hex");
    this.productKey = options.productKey ?? randomBytes(8).toString("hex");
    server.on("connection", (socket) => this.accept(socket));
    discoverySocket.on("message", (datagram: Buffer) =>
      this.answerDiscoveryRequest(datagram),
    );
    // An answer that fails to send, as to an address with no route, is an
    // 'error' event, which would otherwise crash the process.
    discoverySocket.on("error", () => {});
  }

  /** The TCP port a client connects to. */
  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  /** The UDP port the device takes a discovery request on, where a real
   * device takes it on 7000. */
  get requestPort(): number {
    return this.discoverySocket.address().port;
  }

  /** A client is connected and, on 3.4 and 3.5, has agreed a session key. A
   * client's connection can open before the device has accepted it. */
  get ready(): boolean {
    return [...this.sessions].some((session) => this.isReady(session));
  }

  /** Sets `dataPoints`, of the device behind the gateway with `nodeId` if
   * given, and reports them to each connected client in a STATUS frame, as
   * the device does when a data point changes. It throws a `TuyaError` with
   * code `CONNECTION_LOST` when no client is connected, and a `TypeError`
   * for a node ID it does not hold. */
  report(dataPoints: DataPoints, nodeId?: string): void {
    Object.assign(
      nodeId === undefined ? this.dataPoints : this.subDevice(nodeId),
      dataPoints,
    );
    this.send(STATUS, this.status(dataPoints, nodeId));
  }

  /** Pushes a frame to each connected client, with return code 0. STATUS
   * gets the version header. It throws a `TuyaError` with code
   * `CONNECTION_LOST` when no client is connected. */
  send(command: number, plaintext: Uint8Array): void {
    const ready = [...this.sessions].filter((session) => this.isReady(session));
    if (ready.length === 0) {
      throw new TuyaError("CONNECTION_LOST", "No client is connected");
    }
    for (const session of ready) {
      this.write(
        session,
        this.pushSequenceNumber(session),
        command,
        0,
        plaintext,
      );
    }
  }

  /** Closes every client's connection, as a device does. */
  disconnect(): void {
    for (const session of this.sessions) {
      session.socket.destroy();
    }
  }

  /** Sends one broadcast, as the device does every few seconds, to `port`
   * of `address`, where a real device sends it to port 6667 of
   * 255.255.255.255. */
  async broadcast(port: number, address = "127.0.0.1"): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.discoverySocket.send(this.sealBroadcast(), port, address, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }

  /** Disconnects the clients, and resolves once both ports are released. */
  close(): Promise<void> {
    this.disconnect();
    this.closing ??= Promise.all([
      new Promise<void>((resolve) =>
        this.discoverySocket.close(() => resolve()),
      ),
      new Promise<void>((resolve, reject) =>
        this.server.close((error) => (error ? reject(error) : resolve())),
      ),
    ]).then(() => {});
    return this.closing;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // Source: A 3.5 device answers a request with its broadcast, sent to the
  // request's ip rather than to the address it came from, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  // Whether a 3.3 or 3.4 device answers is unknown: see UNSUPPORTED.md.
  private answerDiscoveryRequest(datagram: Buffer): void {
    const ip = openDiscoveryRequest(datagram);
    if (this.options.version === "3.5" && ip !== undefined) {
      this.discoverySocket.send(
        this.sealBroadcast(),
        this.options.answerPort ?? DEFAULT_ANSWER_PORT,
        ip,
      );
    }
  }

  private sealBroadcast(): Buffer {
    return sealBroadcast(
      this.options.version,
      {
        ip: this.options.ip ?? (this.server.address() as AddressInfo).address,
        gwId: this.deviceId,
        uuid: this.uuid,
        productKey: this.productKey,
      },
      randomBytes(IV_LENGTH),
    );
  }

  private isReady(session: Session): boolean {
    return (
      !negotiatesSessionKey(this.options.version) || session.sessionKeyAgreed
    );
  }

  private accept(socket: Socket): void {
    // A client that resets its connection would otherwise crash the process.
    socket.on("error", () => {});
    if (this.sessions.size >= MAX_CLIENTS) {
      socket.destroy();
      return;
    }
    const session: Session = {
      socket,
      key: this.localKey,
      sessionKeyAgreed: false,
      buffered: Buffer.alloc(0),
      sequenceNumber: randomInt(0x10000),
      lastClientSequenceNumber: 0,
      idleTimer: undefined,
    };
    this.sessions.add(session);
    this.keepAlive(session);
    socket.on("close", () => {
      clearTimeout(session.idleTimer);
      this.sessions.delete(session);
    });
    socket.on("data", (chunk: Buffer) => this.receive(session, chunk));
  }

  private keepAlive(session: Session): void {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(
      () => session.socket.destroy(),
      IDLE_TIMEOUT_IN_MS,
    );
  }

  // A frame is answered before the next is read: the frame after
  // SESS_KEY_NEG_FINISH, often in the same read, is under the session key.
  private receive(session: Session, chunk: Buffer): void {
    session.buffered = Buffer.concat([session.buffered, chunk]);
    while (!session.socket.destroyed) {
      let opened: ReturnType<typeof openClientFrame>;
      try {
        opened = openClientFrame(
          this.options.version,
          session.buffered,
          session.key,
        );
      } catch {
        // Source: A 3.1 device ignores a write under another key and keeps
        // the connection, captured in
        // https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765.
        // What a 3.3 device sends back is unknown: see UNSUPPORTED.md.
        session.buffered = Buffer.alloc(0);
        if (negotiatesSessionKey(this.options.version)) {
          session.socket.destroy();
        }
        return;
      }
      if (!opened) {
        return;
      }
      session.buffered = opened.rest;
      const { frame } = opened;
      if (this.options.version === "3.5") {
        if (frame.sequenceNumber <= session.lastClientSequenceNumber) {
          session.socket.destroy();
          return;
        }
        session.lastClientSequenceNumber = frame.sequenceNumber;
      }
      this.keepAlive(session);
      this.received.push(frame);
      this.answer(session, frame);
    }
  }

  private answer(session: Session, frame: ClientFrame): void {
    const { version } = this.options;
    switch (frame.command) {
      case SESS_KEY_NEG_START:
        if (negotiatesSessionKey(version)) {
          session.clientNonce = frame.payload;
          session.deviceNonce = randomBytes(NONCE_LENGTH);
          this.reply(
            session,
            frame,
            0,
            buildSessionKeyResponse(
              session.deviceNonce,
              session.clientNonce,
              this.localKey,
            ),
          );
        }
        return;
      case SESS_KEY_NEG_FINISH:
        if (
          !negotiatesSessionKey(version) ||
          !session.deviceNonce ||
          !session.clientNonce
        ) {
          return;
        }
        if (
          !isSessionKeyFinish(frame.payload, session.deviceNonce, this.localKey)
        ) {
          session.socket.destroy();
          return;
        }
        session.key = deriveSessionKey(
          version,
          session.clientNonce,
          session.deviceNonce,
          this.localKey,
        );
        session.sessionKeyAgreed = true;
        return;
      case HEART_BEAT:
        if (this.answersHeartbeats) {
          this.reply(session, frame, 0, Buffer.alloc(0));
        }
        return;
      case DP_QUERY:
      case DP_QUERY_NEW:
        this.answerQuery(session, frame);
        return;
      case CONTROL:
      case CONTROL_NEW:
        this.answerControl(session, frame);
        return;
      case LAN_EXT_STREAM:
        this.answerSubDeviceQuery(session, frame);
        return;
    }
  }

  // Source: A gateway answers {"reqType":"subdev_online_stat_query",…} with
  // {"reqType":"subdev_online_stat_report","data":{"online":[…],"offline":[…]}},
  // captured on 3.3 in
  // https://github.com/jasonacox/tinytuya/issues/302#issuecomment-1474957230,
  // on 3.4 after an empty frame, captured in
  // https://github.com/jasonacox/tinytuya/issues/677, and on 3.4 and 3.5 in
  // https://github.com/xZetsubou/hass-localtuya/issues/227#issuecomment-2112020068
  // and https://github.com/jasonacox/tinytuya/issues/435.
  private answerSubDeviceQuery(session: Session, frame: ClientFrame): void {
    const { version } = this.options;
    if (
      version === "3.1" ||
      version === "3.2" ||
      field(parseJson(frame.payload), "reqType") !== "subdev_online_stat_query"
    ) {
      return;
    }
    if (version === "3.4") {
      this.reply(session, frame, 0, Buffer.alloc(0));
    }
    const nodeIds = Object.keys(this.subDevices);
    this.reply(
      session,
      frame,
      0,
      json({
        reqType: "subdev_online_stat_report",
        data: {
          online: nodeIds.filter((nodeId) => !this.offline.has(nodeId)),
          offline: nodeIds.filter((nodeId) => this.offline.has(nodeId)),
        },
      }),
    );
  }

  private subDevice(nodeId: string): Record<string, DataPointValue> {
    const dataPoints = this.subDevices[nodeId];
    if (!dataPoints) {
      throw new TypeError(`The gateway holds no device ${nodeId}`);
    }
    return dataPoints;
  }

  // Source: A 3.1 device answers a query with {"devId":…,"dps":…} in plain
  // text, and an empty one with return code 1 and "data format error",
  // captured in https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247504813.
  // Source: Some 3.3 devices answer every query with return code 1 and "json
  // obj data unvalid", captured in
  // https://github.com/TuyaAPI/cli/issues/109#issuecomment-767903303.
  // Source: A device answers a query with its own command: return code 0 and
  // {"dps":…}, or return code 1 and "json obj data unvalid" when it holds no
  // data point, or "data format error" when the query is not JSON, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  // On 3.5 the same commit adds "devId" after "dps", in
  // https://github.com/tuya/TuyaOpen/blob/cd3b764643ba2b3f797dec8b4629b083cc081da1/src/tuya_cloud_service/schema/dp_schema.c#L78.
  // Source: A gateway answers a query naming a device behind it with that
  // device's data points and its node ID, {"dps":…,"cid":…}, captured on 3.3
  // in https://github.com/make-all/tuya-local/issues/3827 and
  // https://github.com/jasonacox/tinytuya/issues/302#issuecomment-1474957230,
  // and on 3.5 in https://github.com/jasonacox/tinytuya/issues/266, and with
  // "json obj data unvalid" for one it cannot read, in the same issue.
  private answerQuery(session: Session, frame: ClientFrame): void {
    const { version } = this.options;
    const message = parseJson(frame.payload);
    const nodeId = field(message, "cid");
    if (typeof nodeId === "string") {
      const dataPoints = this.subDevices[nodeId];
      if (!dataPoints || this.offline.has(nodeId)) {
        this.reply(session, frame, 1, Buffer.from("json obj data unvalid"));
      } else {
        this.reply(session, frame, 0, json({ dps: dataPoints, cid: nodeId }));
      }
      return;
    }
    if (message === undefined) {
      this.reply(session, frame, 1, Buffer.from("data format error"));
    } else if (this.refusesReads || Object.keys(this.dataPoints).length === 0) {
      this.reply(session, frame, 1, Buffer.from("json obj data unvalid"));
    } else if (version === "3.1") {
      this.reply(
        session,
        frame,
        0,
        json({ devId: this.deviceId, dps: this.dataPoints }),
      );
    } else if (version === "3.5") {
      this.reply(
        session,
        frame,
        0,
        json({ dps: this.dataPoints, devId: this.deviceId }),
      );
    } else {
      this.reply(session, frame, 0, json({ dps: this.dataPoints }));
    }
  }

  // Source: A device acks a write with an empty frame of its own command, or
  // "parse data error" when it is not JSON, or "data format error" when its
  // data has no dps; a 3.5 device sets return code 1 on every ack, and takes
  // the dps from the write's "data", acting on nothing without it, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  // Source: A 3.3 device acks with return code 0, in
  // https://github.com/jasonacox/tinytuya/issues/498#issuecomment-2119361833,
  // and a 3.1 device the same, captured in
  // https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247544765.
  // What a 3.4 device sends is unknown: see UNSUPPORTED.md.
  // Source: A device reports in a STATUS each data point it has that a write
  // names with null: after a CONTROL on 3.3, captured in
  // https://github.com/TuyaAPI/cli/issues/109#issuecomment-767903303; before
  // the ack to a CONTROL_NEW on 3.3, captured in
  // https://github.com/TuyaAPI/cli/issues/109#issuecomment-768668877; and
  // after the ack to a CONTROL_NEW on 3.2, captured in
  // https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394;
  // and only the ack when it has none, captured in
  // https://github.com/jasonacox/tinytuya/issues/31#issuecomment-1293304131.
  // When a 3.4 or 3.5 device reports is unknown: see UNSUPPORTED.md.
  // Source: A device sets only the data points it has, in
  // https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
  private answerControl(session: Session, frame: ClientFrame): void {
    const { version } = this.options;
    const returnCode = version === "3.5" ? 1 : 0;
    const message = parseJson(frame.payload);
    if (message === undefined) {
      this.reply(session, frame, returnCode, Buffer.from("parse data error"));
      return;
    }
    const data = negotiatesSessionKey(version)
      ? field(message, "data")
      : message;
    if (data === undefined) {
      this.reply(session, frame, returnCode, Buffer.alloc(0));
      return;
    }
    const written = field(data, "dps");
    if (!isObject(written)) {
      this.reply(session, frame, returnCode, Buffer.from("data format error"));
      return;
    }
    const nodeId = field(data, "cid");
    // Source: A 3.3 gateway acks a write naming a device behind it beside a
    // devId or uid, and does nothing, captured in
    // https://github.com/xZetsubou/hass-localtuya/issues/37.
    const ignored =
      typeof nodeId === "string" &&
      version === "3.3" &&
      (field(data, "devId") !== undefined || field(data, "uid") !== undefined);
    const target =
      typeof nodeId === "string" ? this.subDevices[nodeId] : this.dataPoints;
    if (!target || ignored) {
      this.reply(session, frame, returnCode, Buffer.alloc(0));
      return;
    }
    const named = Object.entries(written).filter(([id]) => id in target);
    const set = Object.fromEntries(
      named.filter(([, value]) => value !== null),
    ) as DataPoints;
    Object.assign(target, set);
    const read = Object.fromEntries(
      named
        .filter(([, value]) => value === null)
        .map(([id]) => [id, target[id] as DataPointValue]),
    );
    const cid = typeof nodeId === "string" ? nodeId : undefined;
    const reportRead = () => {
      if (Object.keys(read).length > 0) {
        this.send(STATUS, this.status(read, cid));
      }
    };
    if (version === "3.3") {
      reportRead();
    }
    this.reply(session, frame, returnCode, Buffer.alloc(0));
    if (version !== "3.3") {
      reportRead();
    }
    if (this.pushesAfterWrite && Object.keys(set).length > 0) {
      this.send(STATUS, this.status(set, cid));
    }
  }

  // Source: A 3.1 device reports {"devId":…,"dps":…,"t":…,"s":…}, captured
  // in https://github.com/jasonacox/tinytuya/pull/177#issuecomment-1247504813.
  // What "s" counts is unknown, and a client reads none of it.
  // Source: A 3.2 or 3.3 device reports {"dps":…,"t":…}, captured in
  // https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394
  // and https://github.com/xZetsubou/hass-localtuya/issues/775, and a 3.4 or 3.5
  // device {"protocol":4,"t":…,"data":{"dps":…}}, captured in
  // https://github.com/jasonacox/tinytuya/discussions/260#discussioncomment-14066063.
  // Source: A gateway names the device behind it a report is from at "cid",
  // beside "dps": on 3.3 at the top, {"dps":…,"cid":…,"t":…}, captured in
  // https://github.com/xZetsubou/hass-localtuya/issues/37, and on 3.4 in
  // "data", in https://github.com/make-all/tuya-local/issues/6400.
  private status(dataPoints: DataPoints, nodeId?: string): Buffer {
    const t = Math.floor(Date.now() / 1000);
    const cid = nodeId === undefined ? {} : { cid: nodeId };
    switch (this.options.version) {
      case "3.1":
        return json({ devId: this.deviceId, dps: dataPoints, t });
      case "3.2":
      case "3.3":
        return json({ dps: dataPoints, ...cid, t });
      default:
        return json({ protocol: 4, t, data: { dps: dataPoints, ...cid } });
    }
  }

  private reply(
    session: Session,
    request: ClientFrame,
    returnCode: number,
    plaintext: Uint8Array,
  ): void {
    this.write(
      session,
      negotiatesSessionKey(this.options.version)
        ? nextSequenceNumber(session)
        : request.command === HEART_BEAT && this.options.version === "3.1"
          ? 0
          : request.sequenceNumber,
      request.command === SESS_KEY_NEG_START
        ? SESS_KEY_NEG_RESP
        : request.command,
      returnCode,
      plaintext,
    );
  }

  private pushSequenceNumber(session: Session): number {
    return negotiatesSessionKey(this.options.version)
      ? nextSequenceNumber(session)
      : 0;
  }

  // Source: A device puts the version header on some of its payloads, as
  // clients look for it in
  // https://github.com/AMoo-Miki/homebridge-tuya-lan/commit/45ad4893c18bbf308bd44ab286918d49833f2ed6
  // and https://github.com/jasonacox/tinytuya/commit/ee995bf90fc3a676803df94e6bb699b362cdf47a.
  // Which ones is unknown: see UNSUPPORTED.md.
  private write(
    session: Session,
    sequenceNumber: number,
    command: number,
    returnCode: number,
    plaintext: Uint8Array,
  ): void {
    session.socket.write(
      sealDeviceFrame(
        this.options.version,
        {
          sequenceNumber,
          command,
          returnCode,
          plaintext,
          versionHeader:
            command === STATUS
              ? { serialNumber: this.headerSerialNumber++, sourceId: 1 }
              : undefined,
        },
        session.key,
        randomBytes(IV_LENGTH),
      ),
    );
  }
}

/** One client's connection, and what the device holds for it. */
interface Session {
  socket: Socket;
  /** The local key, and on 3.4 and 3.5 the session key once agreed. */
  key: Buffer;
  sessionKeyAgreed: boolean;
  buffered: Buffer;
  /** The device's own counter, which numbers its 3.4 and 3.5 frames. */
  sequenceNumber: number;
  lastClientSequenceNumber: number;
  idleTimer: NodeJS.Timeout | undefined;
  clientNonce?: Buffer;
  deviceNonce?: Buffer;
}

function nextSequenceNumber(session: Session): number {
  const sequenceNumber = session.sequenceNumber;
  session.sequenceNumber = (sequenceNumber + 1) >>> 0;
  return sequenceNumber;
}

// Source: 3.4 and 3.5 agree a session key before anything else, in
// https://github.com/codetheweb/tuyapi/commit/c2b5e48e805699969827affbfc11e893aeef701e.
function negotiatesSessionKey(
  version: ProtocolVersion,
): version is "3.4" | "3.5" {
  return version === "3.4" || version === "3.5";
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
