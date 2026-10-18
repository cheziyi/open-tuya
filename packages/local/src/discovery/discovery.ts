import { randomBytes } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { TuyaError } from "@open-tuya/core";
import { type DiscoveredTuyaDevice, decodeBroadcast } from "./broadcast.js";
import { encodeDiscoveryRequest } from "./request.js";

// Source: A 3.1 device broadcasts to UDP port 6666, in
// https://github.com/codetheweb/tuyapi/commit/a14621c5255337642152e7466dcc30af90977157
// and https://github.com/jasonacox/tinytuya/commit/dee8d10292611bc6357e95d44564dc30ccda0678.
const V31_BROADCAST_PORT = 6666;
// Source: A 3.3 device broadcasts to UDP port 6667, in
// https://github.com/jasonacox/tinytuya/commit/dee8d10292611bc6357e95d44564dc30ccda0678
// and https://github.com/codetheweb/tuyapi/commit/ab5c85e568d992f13107dbf684e6bec6df9bb7db,
// and a 3.5 bulb too, captured in
// https://github.com/jasonacox/tinytuya/issues/247#issuecomment-1372462132.
// Which port a 3.4 device broadcasts to is unknown: see UNSUPPORTED.md.
const BROADCAST_PORT = 6667;
// Source: A 3.5 device takes a request on UDP port 7000 and answers to port
// 7000, in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1.
const ANSWER_PORT = 7000;
const REQUEST_INTERVAL_IN_MS = 6000;
const IV_LENGTH = 12;

export interface DiscoverDevicesOptions {
  /** Called for each broadcast a device sends and each answer to a request,
   * so again for each device every few seconds. */
  onDevice?: (device: DiscoveredTuyaDevice) => void;
}

/** Where a request goes. */
export interface DiscoveryRequestTarget {
  /** The broadcast address of an interface's subnet. */
  address: string;
  port: number;
  /** The interface's own address, which a device answers to. */
  ip: string;
}

/** Listens for devices on the LAN, on UDP ports 6666, 6667 and 7000, and
 * asks 3.5 devices to answer every 6 s, as some answer only when asked. It
 * resolves once every port is bound, and rejects with a `TuyaError` with
 * code `DISCOVERY_FAILED` when one cannot be. */
export async function discoverDevices(
  options: DiscoverDevicesOptions = {},
): Promise<TuyaDiscovery> {
  const bound = await Promise.allSettled([
    bindSocket(V31_BROADCAST_PORT),
    bindSocket(BROADCAST_PORT),
    bindSocket(ANSWER_PORT),
  ]);
  const sockets = bound.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failure = bound.find((result) => result.status === "rejected");
  if (failure) {
    await Promise.all(sockets.map(closeSocket));
    throw failure.reason;
  }
  const [v31BroadcastSocket, broadcastSocket, answerSocket] = sockets as [
    Socket,
    Socket,
    Socket,
  ];
  answerSocket.setBroadcast(true);
  return new TuyaDiscovery(
    [v31BroadcastSocket, broadcastSocket],
    answerSocket,
    listRequestTargets,
    options,
  );
}

/** Binds a UDP socket to `port` on every interface, sharing the port with
 * other programs that listen on it. It rejects with a `TuyaError` with code
 * `DISCOVERY_FAILED` when a program holds the port without sharing it. */
export async function bindSocket(port: number): Promise<Socket> {
  // libuv sets SO_REUSEADDR for reuseAddr on Linux and SO_REUSEPORT on macOS.
  // On Linux, a program that sets SO_REUSEPORT alone, such as tinytuya,
  // shares its port only with another that sets it too; elsewhere, reusePort
  // fails the bind.
  const socket = createSocket({
    type: "udp4",
    reuseAddr: true,
    reusePort: process.platform === "linux",
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(port, () => {
        socket.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    socket.close();
    throw new TuyaError(
      "DISCOVERY_FAILED",
      `UDP port ${port} could not be bound: another program holds it`,
      { cause: error },
    );
  }
  return socket;
}

/** Listens for devices on the LAN. Start one with `discoverDevices`.
 * `await using` closes it at the end of its scope. */
export class TuyaDiscovery implements AsyncDisposable {
  private readonly reports = new Map<string, DiscoveredTuyaDevice>();
  private readonly requests: NodeJS.Timeout;
  private closing: Promise<void> | undefined;

  constructor(
    private readonly broadcastSockets: readonly Socket[],
    private readonly answerSocket: Socket,
    private readonly listRequestTargets: () => DiscoveryRequestTarget[],
    private readonly options: DiscoverDevicesOptions = {},
  ) {
    for (const socket of [...broadcastSockets, answerSocket]) {
      socket.on("message", (datagram: Buffer) => this.receive(datagram));
      // A UDP socket has no connection to lose, so an error costs one
      // datagram at most: see DESIGN.md#discovery.
      socket.on("error", () => {});
    }
    this.request();
    this.requests = setInterval(() => this.request(), REQUEST_INTERVAL_IN_MS);
  }

  /** The latest report from each device heard, by `deviceId`. A device that
   * went away stays until another report replaces it. Pass the discovery to
   * `createLocalTuyaClient` to follow a device to a new address. */
  get devices(): ReadonlyMap<string, DiscoveredTuyaDevice> {
    return this.reports;
  }

  /** Stops asking and listening, and resolves once every port is released. */
  close(): Promise<void> {
    clearInterval(this.requests);
    this.closing ??= Promise.all(
      [...this.broadcastSockets, this.answerSocket].map(closeSocket),
    ).then(() => {});
    return this.closing;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private receive(datagram: Buffer): void {
    const device = decodeBroadcast(datagram);
    if (device) {
      this.reports.set(device.deviceId, device);
      this.options.onDevice?.(device);
    }
  }

  // An interface that went away since it was listed fails its send, which
  // the callback ignores: the next round lists the interfaces again.
  private request(): void {
    for (const target of this.listRequestTargets()) {
      this.answerSocket.send(
        encodeDiscoveryRequest(target.ip, randomBytes(IV_LENGTH)),
        target.port,
        target.address,
        () => {},
      );
    }
  }
}

// A request to 255.255.255.255 leaves by one interface alone, so each
// interface gets its own, to its subnet's broadcast address.
function listRequestTargets(): DiscoveryRequestTarget[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => ({
      address: broadcastAddress(address.address, address.netmask),
      port: ANSWER_PORT,
      ip: address.address,
    }));
}

function broadcastAddress(address: string, netmask: string): string {
  const broadcast = (toInteger(address) | ~toInteger(netmask)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (broadcast >>> shift) & 0xff).join(".");
}

function toInteger(address: string): number {
  return address
    .split(".")
    .reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function closeSocket(socket: Socket): Promise<void> {
  return new Promise((resolve) => socket.close(() => resolve()));
}
