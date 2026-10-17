import { randomInt } from "node:crypto";
import {
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
import { COMMANDS } from "./protocol/commands.js";
import {
  buildControl,
  buildQuery,
  type DataPointRequest,
  parseDataPoints,
} from "./protocol/dataPoints.js";
import type { ReceivedTuyaFrame } from "./protocol/frame.js";
import type { VersionHeaderFields } from "./protocol/versionHeader.js";

const REPLY_TIMEOUT_IN_MS = 5000;
const FIRST_RECONNECT_DELAY_IN_MS = 5000;
const MAX_RECONNECT_DELAY_IN_MS = 60_000;
// The range of the source ID a write carries: see DESIGN.md#client.
const MIN_SOURCE_ID = 1000;
const MAX_SOURCE_ID = 1_000_999;

export interface CreateLocalTuyaClientOptions
  extends Omit<OpenConnectionOptions, keyof ConnectionListeners> {
  /** The device's ID, as the Tuya cloud gives it. */
  deviceId: string;
}

/** Connects to a device on the LAN, and keeps connecting: see
 * `LocalTuyaClient`. */
export function createLocalTuyaClient(
  options: CreateLocalTuyaClientOptions,
): LocalTuyaClient {
  const { deviceId, ...connectionOptions } = options;
  return new LocalTuyaClient(
    (listeners) => openConnection({ ...connectionOptions, ...listeners }),
    options.version,
    deviceId,
  );
}

interface PendingRequest {
  command: number;
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
/** A device on the LAN. It connects when created, reads the device's data
 * points once connected and hands them to the `onDataPoints` listeners, and
 * reconnects after a loss: 5 s later, doubling to 60 s. A request fails at
 * once while the client waits to reconnect, with the error that ended the last
 * connection. */
export class LocalTuyaClient implements TuyaClient {
  private connection: Promise<TuyaConnection> | undefined;
  private connectionOpen = false;
  private lastError: unknown;
  private pending: PendingRequest | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  private reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private closed = false;
  private serialNumber = 1;
  private readonly sourceId = randomInt(MIN_SOURCE_ID, MAX_SOURCE_ID + 1);

  constructor(
    private readonly connect: (
      listeners: ConnectionListeners,
    ) => Promise<TuyaConnection>,
    private readonly version: ProtocolVersion,
    private readonly deviceId: string,
  ) {
    this.open();
  }

  get connected(): boolean {
    return this.connectionOpen && !this.closed;
  }

  /** It rejects with a `TuyaError` with code `REQUEST_REJECTED` when the
   * device answers with an error, such as "json obj data unvalid" from a
   * device with nothing to report yet, and `REQUEST_TIMED_OUT` when it does
   * not answer within 5 s. */
  async readDataPoints(): Promise<DataPoints> {
    const reply = await this.request(buildQuery(this.version, this.deviceId));
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
      { serialNumber: this.serialNumber++, sourceId: this.sourceId },
    );
    if (ack.payload.length > 0) {
      throw rejected(ack);
    }
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    const connection = await this.connection?.catch(() => undefined);
    await connection?.close();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private open(): void {
    const connection = this.connect({
      onFrame: (frame) => this.receive(frame),
      onDroppedFrame: (error) => this.pending?.fail(error),
      onClose: (error) => this.lose(error),
    });
    this.connection = connection;
    connection.then(
      () => {
        this.connectionOpen = true;
        this.reconnectDelayInMs = FIRST_RECONNECT_DELAY_IN_MS;
        this.readDataPoints().then(
          (dataPoints) => this.report(dataPoints),
          () => {},
        );
      },
      (error: unknown) => this.lose(error),
    );
  }

  private lose(error: unknown): void {
    this.connection = undefined;
    this.connectionOpen = false;
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

  // One request at a time: a reply is matched by its command alone, as a 3.4
  // or 3.5 device numbers its frames from a counter of its own.
  private request(
    request: DataPointRequest,
    fields?: VersionHeaderFields,
  ): Promise<ReceivedTuyaFrame> {
    const send = () => this.send(request, fields);
    const reply = this.queue.then(send, send);
    this.queue = reply.catch(() => {});
    return reply;
  }

  private async send(
    { command, plaintext }: DataPointRequest,
    fields?: VersionHeaderFields,
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

  private receive(frame: ReceivedTuyaFrame): void {
    if (frame.command === this.pending?.command) {
      this.pending.settle(frame);
      return;
    }
    if (frame.command === COMMANDS.STATUS) {
      const dataPoints = parseDataPoints(frame.payload);
      if (dataPoints && Object.keys(dataPoints).length > 0) {
        this.report(dataPoints);
      }
    }
  }

  private report(dataPoints: DataPoints): void {
    for (const listener of this.listeners) {
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
