import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { TuyaError } from "@open-tuya/core";
import {
  decodePackets,
  encodeConnect,
  encodeDisconnect,
  encodePingRequest,
  encodeSubscribe,
  encodeUnsubscribe,
  PACKET_TYPES,
  type PublishedMessage,
  parseConnack,
  parsePublish,
} from "./packet.js";

const OPEN_TIMEOUT_IN_MS = 10_000;
// Source: The SDK connects with paho's defaults, MQTT 3.1.1 and a keep-alive
// of 60 s, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1,
// and its CONNECT carries `k60` in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301.
const KEEP_ALIVE_IN_SECONDS = 60;
const MAX_PACKET_ID = 0xffff;

export interface MqttConnectionListeners {
  onMessage: (message: PublishedMessage) => void;
  /** Called once when the connection closes, with no error after `close`.
   * Never called when `openMqttConnection` rejects. */
  onClose: (error?: TuyaError) => void;
}

export interface OpenMqttConnectionOptions extends MqttConnectionListeners {
  /** `ssl://host:port` for TLS, as the cloud gives it, or `tcp://host:port`. */
  url: string;
  clientId: string;
  username: string;
  password: string;
}

// Source: An `ssl` URL connects over TLS with the default CAs, and any other
// over TCP, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
/** Opens an MQTT connection with a clean session. It rejects with a
 * `TuyaError` with code `CONNECTION_FAILED` when the server does not accept
 * it within 10 s. */
export async function openMqttConnection(
  options: OpenMqttConnectionOptions,
): Promise<MqttConnection> {
  const url = new URL(options.url);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), OPEN_TIMEOUT_IN_MS);
  try {
    const socket = await connectSocket(url, deadline.signal);
    try {
      const remainder = await handshake(socket, options, deadline.signal);
      return new MqttConnection(socket, options, remainder);
    } catch (error) {
      socket.destroy();
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** An open MQTT connection. It pings the server every 60 s, and closes with
 * `CONNECTION_LOST` once a ping goes unanswered until the next. */
export class MqttConnection implements AsyncDisposable {
  private buffered: Buffer;
  private packetId = 0;
  private awaitingPingResponse = false;
  private closed = false;
  private socketError: Error | undefined;
  private readonly ping: NodeJS.Timeout;
  private readonly released: Promise<void>;

  constructor(
    private readonly socket: Socket,
    private readonly listeners: MqttConnectionListeners,
    remainder: Buffer,
  ) {
    this.buffered = remainder;
    this.released = new Promise((resolve) =>
      socket.once("close", () => resolve()),
    );
    socket.on("data", (chunk: Buffer) => this.receive(chunk));
    socket.on("error", (error) => {
      this.socketError = error;
    });
    socket.on("close", () =>
      this.end(
        new TuyaError("CONNECTION_LOST", "The MQTT connection closed", {
          cause: this.socketError,
        }),
      ),
    );
    socket.resume();
    this.ping = setInterval(() => this.beat(), KEEP_ALIVE_IN_SECONDS * 1000);
    if (remainder.length > 0) {
      this.receive(Buffer.alloc(0));
    }
  }

  /** Subscribes to `topic` at QoS 0. Does nothing once closed. */
  subscribe(topic: string): void {
    this.write(encodeSubscribe(this.nextPacketId(), topic));
  }

  /** Does nothing once closed. */
  unsubscribe(topic: string): void {
    this.write(encodeUnsubscribe(this.nextPacketId(), topic));
  }

  /** Sends DISCONNECT, calls `onClose` with no error, and resolves once the
   * socket is released. */
  async close(): Promise<void> {
    if (!this.closed) {
      this.end();
      this.socket.end(encodeDisconnect(), () => this.socket.destroy());
    }
    await this.released;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private receive(chunk: Buffer): void {
    let packets: ReturnType<typeof decodePackets>;
    try {
      packets = decodePackets(Buffer.concat([this.buffered, chunk]));
    } catch (error) {
      this.lose("The MQTT server sent bytes that are not a packet", error);
      return;
    }
    this.buffered = packets.remainder;
    for (const packet of packets.packets) {
      if (packet.type === PACKET_TYPES.PINGRESP) {
        this.awaitingPingResponse = false;
      } else if (packet.type === PACKET_TYPES.PUBLISH && !this.closed) {
        this.listeners.onMessage(parsePublish(packet.flags, packet.body));
      }
    }
  }

  private beat(): void {
    if (this.awaitingPingResponse) {
      this.lose("The MQTT server stopped answering pings");
      return;
    }
    this.awaitingPingResponse = true;
    this.write(encodePingRequest());
  }

  private write(bytes: Buffer): void {
    if (!this.closed) {
      this.socket.write(bytes);
    }
  }

  private nextPacketId(): number {
    this.packetId = (this.packetId % MAX_PACKET_ID) + 1;
    return this.packetId;
  }

  private lose(message: string, cause?: unknown): void {
    this.end(new TuyaError("CONNECTION_LOST", message, { cause }));
    this.socket.destroy();
  }

  private end(error?: TuyaError): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.ping);
    this.listeners.onClose(error);
  }
}

function connectSocket(url: URL, deadline: AbortSignal): Promise<Socket> {
  const host = url.hostname;
  const port = Number(url.port);
  const secure = url.protocol === "ssl:";
  return new Promise((resolve, reject) => {
    const socket = secure
      ? connectTls({ host, port, servername: host })
      : connectTcp({ host, port });
    const fail = (cause?: unknown) => {
      deadline.removeEventListener("abort", timeOut);
      socket.destroy();
      reject(
        new TuyaError(
          "CONNECTION_FAILED",
          `No MQTT connection to ${url.host} opened`,
          { cause },
        ),
      );
    };
    const timeOut = () => fail(deadline.reason);
    deadline.addEventListener("abort", timeOut, { once: true });
    socket.once("error", fail);
    socket.once(secure ? "secureConnect" : "connect", () => {
      deadline.removeEventListener("abort", timeOut);
      socket.off("error", fail);
      resolve(socket);
    });
  });
}

function handshake(
  socket: Socket,
  options: OpenMqttConnectionOptions,
  deadline: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const finish = (error?: TuyaError, remainder?: Buffer) => {
      deadline.removeEventListener("abort", timeOut);
      socket.off("data", receive);
      socket.off("close", closed);
      socket.pause();
      if (error) {
        reject(error);
      } else {
        resolve(remainder ?? Buffer.alloc(0));
      }
    };
    const fail = (message: string, cause?: unknown) =>
      finish(new TuyaError("CONNECTION_FAILED", message, { cause }));
    const timeOut = () =>
      fail("The MQTT server did not accept the connection in time");
    const closed = () => fail("The MQTT server closed the connection");
    const receive = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      let first: ReturnType<typeof decodePackets>["packets"][number];
      try {
        const [packet] = decodePackets(buffered).packets;
        if (!packet) {
          return;
        }
        first = packet;
      } catch (error) {
        fail("The MQTT server sent bytes that are not a packet", error);
        return;
      }
      const returnCode = parseConnack(first.body);
      if (first.type !== PACKET_TYPES.CONNACK || returnCode !== 0) {
        fail(
          `The MQTT server refused the connection: return code ${returnCode}`,
        );
        return;
      }
      const end =
        first.body.byteOffset - buffered.byteOffset + first.body.length;
      finish(undefined, buffered.subarray(end));
    };
    deadline.addEventListener("abort", timeOut, { once: true });
    socket.on("data", receive);
    socket.once("close", closed);
    socket.write(
      encodeConnect({
        clientId: options.clientId,
        username: options.username,
        password: options.password,
        keepAliveInSeconds: KEEP_ALIVE_IN_SECONDS,
      }),
    );
  });
}
