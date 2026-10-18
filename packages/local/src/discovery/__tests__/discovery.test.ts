import { createSocket, type Socket, type SocketOptions } from "node:dgram";
import { PROTOCOL_VERSIONS, type ProtocolVersion } from "@open-tuya/core";
import {
  type SimulatedTuyaDevice,
  startSimulatedDevice,
} from "@open-tuya/simulators";
import { afterEach, describe, expect, it, vi } from "vitest";
import { until, useFakeTimers } from "../../__tests__/clock.js";
import { DISCOVERY_REQUEST } from "../../protocol/__tests__/fixtures/computedFrames.js";
import type { DiscoveredTuyaDevice } from "../broadcast.js";
import {
  bindSocket,
  type DiscoveryRequestTarget,
  discoverDevices,
  TuyaDiscovery,
} from "../discovery.js";
import { encodeDiscoveryRequest } from "../request.js";

const LOCAL_KEY = "0123456789abcdef";

const cleanups: (() => unknown)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

/** Binds a socket to `port` without sharing it, on `address`, or on every
 * interface when none is given. */
async function bind(
  port = 0,
  address?: string,
  options: SocketOptions = { type: "udp4" },
): Promise<Socket> {
  const socket = createSocket(options);
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, address, () => resolve());
  });
  cleanups.push(() => close(socket));
  return socket;
}

function close(socket: Socket): Promise<void> {
  return new Promise((resolve) => socket.close(() => resolve()));
}

async function send(
  socket: Socket,
  datagram: Uint8Array,
  port: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    socket.send(datagram, port, "127.0.0.1", (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}

async function startDevice(
  version: ProtocolVersion,
  answerPort?: number,
): Promise<SimulatedTuyaDevice> {
  const device = await startSimulatedDevice({
    version,
    localKey: LOCAL_KEY,
    answerPort,
  });
  cleanups.push(() => device.close());
  return device;
}

// Two loopback sockets stand in for ports 6667 and 7000, so that no request
// leaves the machine and no device on the LAN answers one. The targets are
// listed again before each round of requests, as the interfaces are.
async function startDiscovery(targets: DiscoveryRequestTarget[] = []) {
  const broadcastSocket = createSocket("udp4");
  const answerSocket = createSocket("udp4");
  for (const socket of [broadcastSocket, answerSocket]) {
    await new Promise<void>((resolve) => socket.bind(0, "127.0.0.1", resolve));
  }
  const devices: DiscoveredTuyaDevice[] = [];
  const discovery = new TuyaDiscovery(
    broadcastSocket,
    answerSocket,
    () => targets,
    { onDevice: (device) => devices.push(device) },
  );
  cleanups.push(() => discovery.close());
  return {
    discovery,
    devices,
    broadcastPort: broadcastSocket.address().port,
    answerPort: answerSocket.address().port,
  };
}

function described(device: SimulatedTuyaDevice, version: ProtocolVersion) {
  return {
    host: "127.0.0.1",
    deviceId: device.deviceId,
    version,
    productKey: device.productKey,
  };
}

describe.each(PROTOCOL_VERSIONS)("TuyaDiscovery on %s", (version) => {
  it("reports a device's broadcast", async () => {
    const { devices, broadcastPort } = await startDiscovery();
    const device = await startDevice(version);

    await device.broadcast(broadcastPort);
    await until(() => devices.length === 1);

    expect(devices).toEqual([described(device, version)]);
  });

  it("reports every broadcast, as a device repeats them", async () => {
    const { devices, broadcastPort } = await startDiscovery();
    const device = await startDevice(version);

    await device.broadcast(broadcastPort);
    await device.broadcast(broadcastPort);
    await until(() => devices.length === 2);

    expect(devices[1]).toEqual(devices[0]);
  });
});

describe("TuyaDiscovery", () => {
  it("asks a 3.5 device, which answers with its broadcast", async () => {
    useFakeTimers();
    const targets: DiscoveryRequestTarget[] = [];
    const { devices, answerPort } = await startDiscovery(targets);
    const device = await startDevice("3.5", answerPort);
    targets.push({
      address: "127.0.0.1",
      port: device.requestPort,
      ip: "127.0.0.1",
    });

    vi.advanceTimersByTime(6000);
    await until(() => devices.length === 1);

    expect(devices).toEqual([described(device, "3.5")]);
  });

  it("asks when started and every 6 s after, with a new IV each time", async () => {
    useFakeTimers();
    const socket = await bind(0, "127.0.0.1");
    const requests: Buffer[] = [];
    socket.on("message", (datagram: Buffer) => requests.push(datagram));
    const target = {
      address: "127.0.0.1",
      port: socket.address().port,
      ip: "192.168.1.10",
    };
    await startDiscovery([target]);

    await until(() => requests.length === 1);
    vi.advanceTimersByTime(6000);
    await until(() => requests.length === 2);

    for (const request of requests) {
      expect(request).toEqual(
        encodeDiscoveryRequest(target.ip, request.subarray(18, 30)),
      );
    }
    expect(requests[0]?.subarray(18, 30)).not.toEqual(
      requests[1]?.subarray(18, 30),
    );
  });

  it("keeps each device's latest report, by its ID", async () => {
    const { discovery, broadcastPort } = await startDiscovery();
    const other = await startDevice("3.3");
    const moved = await startSimulatedDevice({
      version: "3.3",
      localKey: LOCAL_KEY,
      deviceId: other.deviceId,
      productKey: other.productKey,
      ip: "192.168.1.20",
    });
    cleanups.push(() => moved.close());
    const device = await startDevice("3.4");

    await other.broadcast(broadcastPort);
    await until(() => discovery.devices.has(other.deviceId));
    await device.broadcast(broadcastPort);
    await moved.broadcast(broadcastPort);
    await until(
      () =>
        discovery.devices.get(other.deviceId)?.host === "192.168.1.20" &&
        discovery.devices.has(device.deviceId),
    );

    expect(Object.fromEntries(discovery.devices)).toEqual({
      [other.deviceId]: { ...described(other, "3.3"), host: "192.168.1.20" },
      [device.deviceId]: described(device, "3.4"),
    });
  });

  it("leaves out a client's request, and datagrams that are not broadcasts", async () => {
    const { devices, broadcastPort, answerPort } = await startDiscovery();
    const socket = await bind(0, "127.0.0.1");
    const device = await startDevice("3.3");

    await send(socket, DISCOVERY_REQUEST, answerPort);
    await send(socket, Buffer.from("not a broadcast"), broadcastPort);
    await device.broadcast(broadcastPort);
    await until(() => devices.length === 1);

    expect(devices).toEqual([described(device, "3.3")]);
  });

  it("goes on listening after a request to a port nobody listens on", async () => {
    const closed = createSocket("udp4");
    await new Promise<void>((resolve) => closed.bind(0, "127.0.0.1", resolve));
    const closedPort = closed.address().port;
    await close(closed);
    const { devices, answerPort } = await startDiscovery([
      { address: "127.0.0.1", port: closedPort, ip: "127.0.0.1" },
    ]);
    const device = await startDevice("3.5");

    // Gives the port unreachable reply time to reach the socket first.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await device.broadcast(answerPort);
    await until(() => devices.length === 1);

    expect(devices).toEqual([described(device, "3.5")]);
  });

  it("releases both ports when closed", async () => {
    const { discovery, broadcastPort, answerPort } = await startDiscovery();

    await discovery.close();
    await discovery.close();

    await expect(bind(broadcastPort, "127.0.0.1")).resolves.toBeDefined();
    await expect(bind(answerPort, "127.0.0.1")).resolves.toBeDefined();
  });

  it("releases both ports at the end of an await using scope", async () => {
    const started = await startDiscovery();
    {
      await using _discovery = started.discovery;
    }

    await expect(
      bind(started.broadcastPort, "127.0.0.1"),
    ).resolves.toBeDefined();
    await expect(bind(started.answerPort, "127.0.0.1")).resolves.toBeDefined();
  });
});

describe("bindSocket", () => {
  async function bound(port: number): Promise<Socket> {
    const socket = await bindSocket(port);
    cleanups.push(() => close(socket));
    return socket;
  }

  it("shares its port with another discovery", async () => {
    const first = await bound(0);

    await expect(bound(first.address().port)).resolves.toBeDefined();
  });

  // tinytuya and hass-localtuya set SO_REUSEPORT alone.
  it.runIf(process.platform === "linux")(
    "shares its port with a program that sets SO_REUSEPORT alone",
    async () => {
      const other = await bind(0, undefined, {
        type: "udp4",
        reusePort: true,
      });

      await expect(bound(other.address().port)).resolves.toBeDefined();
    },
  );

  // On Windows, SO_REUSEADDR takes over a port another socket holds.
  it.skipIf(process.platform === "win32")(
    "rejects with DISCOVERY_FAILED when a program holds the port",
    async () => {
      const other = await bind();

      await expect(bindSocket(other.address().port)).rejects.toMatchObject({
        code: "DISCOVERY_FAILED",
        cause: expect.objectContaining({ code: "EADDRINUSE" }),
      });
    },
  );
});

describe("discoverDevices", () => {
  // It fails before it asks, so no request leaves the machine.
  it.skipIf(process.platform === "win32")(
    "rejects with DISCOVERY_FAILED when a program holds port 6667, and releases port 7000",
    async () => {
      await bind(6667);

      await expect(
        discoverDevices({ onDevice: () => {} }),
      ).rejects.toMatchObject({ code: "DISCOVERY_FAILED" });
      await expect(bind(7000)).resolves.toBeDefined();
    },
  );
});
