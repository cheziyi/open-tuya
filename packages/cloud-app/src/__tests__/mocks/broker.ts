import { type AddressInfo, createServer, type Socket } from "node:net";
import { Aedes, type AuthenticateError, type Client } from "aedes";

export interface Broker {
  /** `tcp://127.0.0.1:port`. */
  url: string;
  aedes: Aedes;
  /** The client ID, username and password of each client that connected. */
  connects: { clientId: string; username?: string; password?: string }[];
  /** The topics clients subscribe to, in order. */
  subscriptions: string[];
  /** The topics clients unsubscribe from, in order. */
  unsubscriptions: string[];
  clients: Client[];
  publish(topic: string, payload: string): Promise<void>;
  close(): Promise<void>;
}

export interface StartBrokerOptions {
  /** The password the broker takes, which it refuses any other. Any password
   * by default. */
  password?: string;
}

/** An aedes MQTT broker on 127.0.0.1, written by others than this
 * repository's MQTT client. */
export async function startBroker(
  options: StartBrokerOptions = {},
): Promise<Broker> {
  const connects: Broker["connects"] = [];
  const aedes = await Aedes.createBroker({
    authenticate: (client, username, password, done) => {
      connects.push({
        clientId: client.id,
        ...(username !== undefined && { username }),
        ...(password !== undefined && { password: password.toString() }),
      });
      if (options.password && password?.toString() !== options.password) {
        const error = new Error("Refused") as AuthenticateError;
        error.returnCode = 5;
        done(error, false);
        return;
      }
      done(null, true);
    },
  });
  const subscriptions: string[] = [];
  const unsubscriptions: string[] = [];
  const clients: Client[] = [];
  aedes.on("client", (client) => clients.push(client));
  aedes.on("subscribe", (subscribed) =>
    subscriptions.push(...subscribed.map(({ topic }) => topic)),
  );
  aedes.on("unsubscribe", (topics) => unsubscriptions.push(...topics));
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    aedes.handle(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `tcp://127.0.0.1:${(server.address() as AddressInfo).port}`,
    aedes,
    connects,
    subscriptions,
    unsubscriptions,
    clients,
    publish: (topic, payload) =>
      new Promise((resolve, reject) =>
        aedes.publish(
          {
            cmd: "publish",
            topic,
            payload: Buffer.from(payload),
            qos: 0,
            retain: false,
            dup: false,
          },
          (error) => (error ? reject(error) : resolve()),
        ),
      ),
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
