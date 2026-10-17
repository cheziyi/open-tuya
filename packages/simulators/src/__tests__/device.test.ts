import { createSocket } from "node:dgram";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { startSimulatedDevice } from "../device.js";

async function listenOn(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

async function bindTo(port: number): Promise<void> {
  const socket = createSocket("udp4");
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => socket.close(() => resolve()));
}

describe("SimulatedTuyaDevice", () => {
  it("releases both its ports at the end of an await using scope, closed twice", async () => {
    let port: number;
    let requestPort: number;
    {
      await using device = await startSimulatedDevice({
        version: "3.3",
        localKey: "0123456789abcdef",
      });
      ({ port, requestPort } = device);
      await device.close();
    }

    await expect(listenOn(port)).resolves.toBeUndefined();
    await expect(bindTo(requestPort)).resolves.toBeUndefined();
  });
});
