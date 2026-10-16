import { type AddressInfo, createServer, type Socket } from "node:net";

export interface RawDevice {
  port: number;
  /** Every byte the clients sent, in order. */
  received: Buffer[];
  close(): Promise<void>;
}

/** A TCP server on 127.0.0.1 that writes `bytes` to each client as it
 * connects, and `answer` each time the client sends something. It records
 * what the client sends. */
export async function startRawDevice(
  bytes: Uint8Array,
  answer: Uint8Array = Buffer.alloc(0),
): Promise<RawDevice> {
  const server = createServer();
  const sockets: Socket[] = [];
  const received: Buffer[] = [];
  server.on("connection", (socket) => {
    sockets.push(socket);
    socket.on("error", () => {});
    socket.on("data", (chunk: Buffer) => {
      received.push(chunk);
      socket.write(answer);
    });
    socket.write(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    received,
    close: () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
