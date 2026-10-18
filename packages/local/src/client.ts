import { randomInt } from "node:crypto";
import {
  type DataPointId,
  type DataPoints,
  type ProtocolVersion,
  type TuyaClient,
  TuyaError,
} from "@open-tuya/core";
import {
  type ConnectionListeners,
  type OpenConnectionOptions,
  openConnection,
  type TuyaConnection,
} from "./connection.js";
import type { TuyaDiscovery } from "./discovery/discovery.js";
import { COMMANDS } from "./protocol/commands.js";
import {
  buildControl,
  buildNullRead,
  buildQuery,
  buildSubDeviceControl,
  buildSubDeviceQuery,
  type DataPointRequest,
  type GatewayProtocolVersion,
  parseDataPoints,
  parseReport,
} from "./protocol/dataPoints.js";
import type { ReceivedTuyaFrame } from "./protocol/frame.js";
import {
  buildSubDeviceStatusQuery,
  parseSubDeviceStatus,
} from "./protocol/subDevices.js";
import type { VersionHeaderFields } from "./protocol/versionHeader.js";
import { SubDeviceTuyaClient } from "./subDevice.js";

const REPLY_TIMEOUT_IN_MS = 5000;
const FIRST_RECONNECT_DELAY_IN_MS = 5000;
const MAX_RECONNECT_DELAY_IN_MS = 60_000;
// How often a gateway is asked which devices behind it are online: see
// DESIGN.md#gateways.
const SUB_DEVICE_STATUS_INTERVAL_IN_MS = 30_000;
// The range of the source ID a write carries: see DESIGN.md#client.
const MIN_SOURCE_ID = 1000;
const MAX_SOURCE_ID = 1_000_999;

export interface CreateLocalTuyaClientOptions
  extends Omit<OpenConnectionOptions, keyof ConnectionListeners> {
  /** The device's ID, as the Tuya cloud gives it. */
  deviceId: string;
  /** A discovery the caller keeps open, to follow the device to a new
   * address: after a failed connect or a lost connection, the client tries
   * the address the discovery last heard the device at. Defaults to none:
   * the client keeps `host`. */
  discovery?: TuyaDiscovery;
  /** The data points to read by writing null to each, in place of a read the
   * device refuses: every 3.2 device that answers a read with an error, and
   * some 3.3 ones, which answer "json obj data unvalid". A device reports the
   * ones it has, and ignores the rest. On 3.2 and 3.3 alone.
   *
   * A null write changes some devices: a camera reset its settings and
   * formatted its memory card. List only data points that hold a state, never
   * one that acts, and only for a device that refuses a read. Defaults to
   * none: the client reads with a query. */
  readByWritingNull?: readonly DataPointId[];
}

/** Connects to a device on the LAN, and keeps connecting: see
 * `LocalTuyaClient`. It throws a `TypeError` for `readByWritingNull` on
 * another version than 3.2 or 3.3, or empty. */
export function createLocalTuyaClient(
  options: CreateLocalTuyaClientOptions,
): LocalTuyaClient {
  const { deviceId, host, discovery, readByWritingNull, ...connectionOptions } =
    options;
  return new LocalTuyaClient(
    (address, listeners) =>
      openConnection({ ...connectionOptions, host: address, ...listeners }),
    {
      version: options.version,
      deviceId,
      host,
      ...(discovery && { discovery }),
      ...(readByWritingNull && { readByWritingNull }),
    },
  );
}

/** What a `LocalTuyaClient` reaches its device with, as
 * `CreateLocalTuyaClientOptions` describes each. */
export type LocalTuyaClientOptions = Pick<
  CreateLocalTuyaClientOptions,
  "version" | "deviceId" | "host" | "discovery" | "readByWritingNull"
>;

interface RequestOptions {
  fields?: VersionHeaderFields;
  /** The device behind the gateway the request is for. */
  nodeId?: string;
  /** The command of the frame that answers the request, where it is not the
   * request's own: a frame of the request's own is then its ack. */
  replyCommand?: number;
}

interface PendingRequest {
  command: number;
  replyCommand?: number;
  /** Whether the ack to a request with a `replyCommand` has come. */
  acked?: boolean;
  /** The reply to a request with a `replyCommand`, held until its ack. */
  reply?: ReceivedTuyaFrame;
  /** The device behind the gateway the request is for. */
  nodeId?: string;
  settle: (frame: ReceivedTuyaFrame) => void;
  fail: (error: unknown) => void;
}

// Source: A device answers a read or a write with a frame of the request's own
// command: return code 0 and the data points to a read, an empty payload to a
// write, and return code 1 with its error text to either, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
// The same commit acks a write with return code 1 on success, where the
// devices captured in
// https://github.com/jasonacox/tinytuya/issues/498#issuecomment-2119361833 send 0,
// so a write fails on its ack's payload alone.
// Source: A device sends a STATUS for a read by writing null, before its ack
// on 3.3, captured in
// https://github.com/TuyaAPI/cli/issues/109#issuecomment-768668877, and
// after it on 3.2, captured in
// https://github.com/rospogrigio/localtuya/issues/1232#issuecomment-1387550394.
/** A device on the LAN. It connects when created, reads the device's data
 * points once connected and hands them to the `onDataPoints` listeners, and
 * reconnects after a loss: 5 s later, doubling to 60 s. A request fails at
 * once while the client waits to reconnect, with the error that ended the last
 * connection.
 *
 * It connects first to `host`. After a failed connect or a lost connection,
 * it tries the address its `discovery` last heard the device at, unless that
 * is the address that just failed, and otherwise the last address it
 * connected to. While connected it stays where it is, whatever discovery
 * hears. */
export class LocalTuyaClient implements TuyaClient {
  private connection: Promise<TuyaConnection> | undefined;
  private connectionOpen = false;
  private lastError: unknown;
  private pending: PendingRequest | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  private readonly subDeviceListeners = new Map<
    string,
    Set<(dataPoints: DataPoints) => void>
  >();
  private readonly offline = new Set<string>();
  private statusTimer: NodeJS.Timeout | undefined;
  private reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private connectedHost: string;
  private failedHost: string | undefined;
  private closed = false;
  private serialNumber = 1;
  private readonly sourceId = randomInt(MIN_SOURCE_ID, MAX_SOURCE_ID + 1);
  private readonly version: ProtocolVersion;
  private readonly deviceId: string;
  private readonly discovery: TuyaDiscovery | undefined;
  private readonly nullRead: readonly DataPointId[] | undefined;

  constructor(
    private readonly connect: (
      host: string,
      listeners: ConnectionListeners,
    ) => Promise<TuyaConnection>,
    options: LocalTuyaClientOptions,
  ) {
    const { version, readByWritingNull } = options;
    if (readByWritingNull) {
      if (version !== "3.2" && version !== "3.3") {
        throw new TypeError(
          `A ${version} device is not read by writing null: no source shows how`,
        );
      }
      if (readByWritingNull.length === 0) {
        throw new TypeError(
          "A read by writing null needs a data point: a device answers none",
        );
      }
      this.nullRead = readByWritingNull;
    }
    this.version = version;
    this.deviceId = options.deviceId;
    this.discovery = options.discovery;
    this.connectedHost = options.host;
    this.open();
  }

  get connected(): boolean {
    return this.connectionOpen && !this.closed;
  }

  /** It rejects with a `TuyaError` with code `REQUEST_REJECTED` when the
   * device answers with an error, such as "json obj data unvalid" from a
   * device with nothing to report yet, and `REQUEST_TIMED_OUT` when it does
   * not answer within 5 s. With `readByWritingNull`, it resolves with the
   * first STATUS the device sends, once the device has acked the write too.
   * The STATUS also goes to the `onDataPoints` listeners. It times out when
   * the device has none of the data points. */
  async readDataPoints(): Promise<DataPoints> {
    const reply = this.nullRead
      ? await this.request(
          buildNullRead(this.deviceId, this.nullRead, Date.now() / 1000),
          {
            fields: {
              serialNumber: this.serialNumber++,
              sourceId: this.sourceId,
            },
            replyCommand: COMMANDS.STATUS,
          },
        )
      : await this.request(buildQuery(this.version, this.deviceId));
    const dataPoints =
      reply.returnCode === 0 ? parseDataPoints(reply.payload) : undefined;
    if (!dataPoints) {
      throw rejected(reply);
    }
    return dataPoints;
  }

  /** It resolves on the device's ack, and rejects with a `TuyaError` with
   * code `REQUEST_REJECTED` when the ack carries an error, and
   * `REQUEST_TIMED_OUT` when no ack comes within 5 s. */
  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    const ack = await this.request(
      buildControl(this.version, this.deviceId, dataPoints, Date.now() / 1000),
      {
        fields: { serialNumber: this.serialNumber++, sourceId: this.sourceId },
      },
    );
    if (ack.payload.length > 0) {
      throw rejected(ack);
    }
  }

  /** Calls `listener` with the data points the device reports, as
   * `TuyaClient.onDataPoints` does. A gateway's report for a device behind it
   * goes to that device's client instead. */
  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A client for the device behind this gateway with `nodeId`, reached over
   * this client's connection, under its local key. It reads the device once
   * connected, and after each reconnect. While a device behind it is open,
   * it asks the gateway every 30 s which are online. It throws a `TypeError`
   * on 3.1 and 3.2, as no source shows how a gateway of either reaches the
   * devices behind it. */
  createClient(nodeId: string): SubDeviceTuyaClient {
    this.gatewayVersion();
    const client = new SubDeviceTuyaClient({
      connected: () => this.connected && !this.offline.has(nodeId),
      read: () => this.readSubDevice(nodeId),
      write: (dataPoints) => this.writeSubDevice(nodeId, dataPoints),
      subscribe: (listener) => {
        let listeners = this.subDeviceListeners.get(nodeId);
        if (!listeners) {
          listeners = new Set();
          this.subDeviceListeners.set(nodeId, listeners);
        }
        listeners.add(listener);
        return () => this.unsubscribe(nodeId, listener);
      },
    });
    if (!this.closed) {
      this.statusTimer ??= setInterval(
        () => this.querySubDeviceStatus(),
        SUB_DEVICE_STATUS_INTERVAL_IN_MS,
      );
    }
    if (this.connected) {
      this.readSubDevice(nodeId).then(
        (dataPoints) => this.report(dataPoints, nodeId),
        () => {},
      );
    }
    return client;
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.statusTimer);
    const connection = await this.connection?.catch(() => undefined);
    await connection?.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private open(): void {
    const host = this.nextHost();
    const connection = this.connect(host, {
      onFrame: (frame) => this.receive(frame),
      onDroppedFrame: (error) => this.pending?.fail(error),
      onClose: (error) => this.lose(error, host),
    });
    this.connection = connection;
    connection.then(
      () => {
        this.connectionOpen = true;
        this.connectedHost = host;
        this.failedHost = undefined;
        this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
        // A read by writing null is answered by a STATUS, which goes to
        // the listeners as it arrives.
        this.readDataPoints().then(
          (dataPoints) => {
            if (!this.nullRead) {
              this.report(dataPoints);
            }
          },
          () => {},
        );
        for (const nodeId of this.subDeviceListeners.keys()) {
          this.readSubDevice(nodeId).then(
            (dataPoints) => this.report(dataPoints, nodeId),
            () => {},
          );
        }
        if (this.statusTimer) {
          this.querySubDeviceStatus();
        }
      },
      (error: unknown) => this.lose(error, host),
    );
  }

  private lose(error: unknown, host: string): void {
    this.connection = undefined;
    this.connectionOpen = false;
    this.failedHost = host;
    this.lastError =
      error ?? new TuyaError("CONNECTION_LOST", "The client is closed");
    this.pending?.fail(this.lastError);
    // An error that is not a TuyaError, such as a local key of the wrong
    // length, fails every connection alike.
    if (!this.closed && error instanceof TuyaError) {
      this.reconnectTimer = setTimeout(
        () => this.open(),
        this.reconnectDelayInMs,
      );
      this.reconnectDelayInMs = Math.min(
        this.reconnectDelayInMs * 2,
        MAX_RECONNECT_DELAY_IN_MS,
      );
    }
  }

  // Discovery is trusted only once the address in hand fails, and never in
  // place of the address that just failed, so a wrong report costs one
  // attempt before the client returns to the address that last worked: see
  // DESIGN.md#moved-devices.
  private nextHost(): string {
    const heard = this.discovery?.devices.get(this.deviceId)?.host;
    return this.failedHost !== undefined &&
      heard !== undefined &&
      heard !== this.failedHost
      ? heard
      : this.connectedHost;
  }

  // A closed device's node ID leaves the map, so a reconnect reads only the
  // devices still open, and the status query stops with the last of them.
  private unsubscribe(
    nodeId: string,
    listener: (dataPoints: DataPoints) => void,
  ): void {
    const listeners = this.subDeviceListeners.get(nodeId);
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      this.subDeviceListeners.delete(nodeId);
    }
    if (this.subDeviceListeners.size === 0) {
      clearInterval(this.statusTimer);
      this.statusTimer = undefined;
    }
  }

  private gatewayVersion(): GatewayProtocolVersion {
    if (this.version === "3.1" || this.version === "3.2") {
      throw new TypeError(
        `A ${this.version} gateway cannot reach the devices behind it: no source shows how`,
      );
    }
    return this.version;
  }

  private async readSubDevice(nodeId: string): Promise<DataPoints> {
    const reply = await this.request(buildSubDeviceQuery(nodeId), { nodeId });
    const dataPoints =
      reply.returnCode === 0 ? parseDataPoints(reply.payload) : undefined;
    if (!dataPoints) {
      throw rejected(reply);
    }
    return dataPoints;
  }

  private async writeSubDevice(
    nodeId: string,
    dataPoints: DataPoints,
  ): Promise<void> {
    const ack = await this.request(
      buildSubDeviceControl(
        this.gatewayVersion(),
        nodeId,
        dataPoints,
        Date.now() / 1000,
      ),
      {
        fields: { serialNumber: this.serialNumber++, sourceId: this.sourceId },
        nodeId,
      },
    );
    if (ack.payload.length > 0) {
      throw rejected(ack);
    }
  }

  // Its report is a frame of its own command, which no request waits on, so
  // it goes out beside the request in flight.
  private querySubDeviceStatus(): void {
    if (!this.connected) {
      return;
    }
    const { command, plaintext } = buildSubDeviceStatusQuery();
    this.connection
      ?.then((connection) => connection.send(command, plaintext))
      .catch(() => {});
  }

  // One request at a time: a reply is matched by its command, and by the node
  // ID it names, as a 3.4 or 3.5 device numbers its frames from a counter of
  // its own.
  private request(
    request: DataPointRequest,
    options: RequestOptions = {},
  ): Promise<ReceivedTuyaFrame> {
    const send = () => this.send(request, options);
    const reply = this.queue.then(send, send);
    this.queue = reply.catch(() => {});
    return reply;
  }

  private async send(
    { command, plaintext }: DataPointRequest,
    { fields, nodeId, replyCommand }: RequestOptions,
  ): Promise<ReceivedTuyaFrame> {
    if (this.closed) {
      throw new TuyaError("CONNECTION_LOST", "The client is closed");
    }
    if (!this.connection) {
      throw this.lastError;
    }
    const connection = await this.connection;
    return new Promise((resolve, reject) => {
      const end = () => {
        clearTimeout(timeout);
        this.pending = undefined;
      };
      const pending: PendingRequest = {
        command,
        ...(replyCommand !== undefined && { replyCommand }),
        ...(nodeId !== undefined && { nodeId }),
        settle: (frame) => {
          end();
          resolve(frame);
        },
        fail: (error) => {
          end();
          reject(error);
        },
      };
      const timeout = setTimeout(
        () =>
          pending.fail(
            new TuyaError(
              "REQUEST_TIMED_OUT",
              `The device did not answer within ${REPLY_TIMEOUT_IN_MS} ms`,
            ),
          ),
        REPLY_TIMEOUT_IN_MS,
      );
      this.pending = pending;
      connection.send(command, plaintext, fields).catch(pending.fail);
    });
  }

  // Source: A gateway reports which devices behind it are online in a frame
  // of LAN_EXT_STREAM, in
  // https://github.com/jasonacox/tinytuya/commit/d59fdf9546969d0cb57faede60b82424c09d4a7b.
  // A reply naming another device than the request's goes to that device, as
  // hass-localtuya found replies filed under the wrong one in
  // https://github.com/xZetsubou/hass-localtuya/commit/842778d51581f41306d1bff3dcac9247b16a4e61.
  private receive(frame: ReceivedTuyaFrame): void {
    if (frame.command === COMMANDS.LAN_EXT_STREAM) {
      const status = parseSubDeviceStatus(frame.payload);
      for (const nodeId of status?.online ?? []) {
        this.offline.delete(nodeId);
      }
      for (const nodeId of status?.offline ?? []) {
        this.offline.add(nodeId);
      }
      return;
    }
    const report = parseReport(frame.payload);
    const pending = this.pending;
    // The ack to a read by writing null: the data points come in a STATUS,
    // before it or after it. The read waits for both, so an ack that comes
    // late is not taken for the next request's.
    if (
      pending?.replyCommand !== undefined &&
      frame.command === pending.command
    ) {
      if (frame.payload.length > 0) {
        pending.fail(rejected(frame));
      } else if (pending.reply) {
        pending.settle(pending.reply);
      } else {
        pending.acked = true;
      }
      return;
    }
    if (
      pending &&
      frame.command === (pending.replyCommand ?? pending.command) &&
      (report?.nodeId === undefined || report.nodeId === pending.nodeId)
    ) {
      if (pending.replyCommand === undefined) {
        pending.settle(frame);
        return;
      }
      if (pending.acked) {
        pending.settle(frame);
      } else {
        pending.reply ??= frame;
      }
      if (!report) {
        return;
      }
    }
    if (
      report &&
      Object.keys(report.dataPoints).length > 0 &&
      (frame.command === COMMANDS.STATUS || report.nodeId !== undefined)
    ) {
      this.report(report.dataPoints, report.nodeId);
    }
  }

  private report(dataPoints: DataPoints, nodeId?: string): void {
    const listeners =
      nodeId === undefined
        ? this.listeners
        : (this.subDeviceListeners.get(nodeId) ?? []);
    for (const listener of listeners) {
      listener(dataPoints);
    }
  }
}

function rejected(frame: ReceivedTuyaFrame): TuyaError {
  const text = Buffer.from(frame.payload).toString();
  return new TuyaError(
    "REQUEST_REJECTED",
    text
      ? `The device answered "${text}"`
      : `The device answered with return code ${frame.returnCode}`,
  );
}
