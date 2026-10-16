import { type AddressInfo, createServer, type Socket } from "node:net";

export interface RawDevice {
  port: number;
  connected: Promise<Socket>;
  close(): Promise<void>;
}

/** A TCP server on 127.0.0.1 that writes `bytes` to the first client as it
 * connects, then neither reads nor answers. */
export async function startRawDevice(bytes: Uint8Array): Promise<RawDevice> {
  const server = createServer();
  const sockets: Socket[] = [];
  const connected = new Promise<Socket>((resolve) =>
    server.once("connection", (socket) => {
      socket.write(bytes);
      resolve(socket);
    }),
  );
  server.on("connection", (socket) => {
    socket.on("error", () => {});
    sockets.push(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    connected,
    close: () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
