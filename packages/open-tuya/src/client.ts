import {
  type DataPoints,
  type DataPointValue,
  type TuyaClient,
  type TuyaCloudAccount,
  TuyaError,
  type TuyaErrorCode,
} from "@open-tuya/core";
import {
  type ControlValue,
  type ControlValues,
  createDeviceEntry,
  findDeviceEntries,
  listDependencies,
  readControls,
  type TuyaDeviceEntry,
  writeControls,
} from "@open-tuya/devices";
import {
  type CreateLocalTuyaClientOptions,
  createLocalTuyaClient,
  type LocalTuyaClient,
} from "@open-tuya/local";
import { CloudRoute } from "./cloudRoute.js";

// A write moves on only after an error that shows the route did not deliver
// it: after a timeout or a lost connection the device may have taken it, and
// a button written twice acts twice. See DESIGN.md#routes.
const UNDELIVERED_WRITE_CODES: ReadonlySet<TuyaErrorCode> = new Set([
  "CONNECTION_FAILED",
  "SESSION_KEY_NEGOTIATION_FAILED",
  "RATE_LIMITED",
  "SESSION_EXPIRED",
  "PERMISSION_DENIED",
  "UNMAPPED_DATA_POINT",
]);

/** One way to reach a device: over the LAN, with what discovery reports and
 * a cloud's local key; over the LAN through the client of the gateway a
 * device with a `nodeId` is behind; or through a cloud account. Pass the LAN
 * route the discovery, kept open, to follow the device to a new address, as
 * `CreateLocalTuyaClientOptions.discovery` says. The gateway's client, the
 * discovery and the account belong to the caller, who closes them. */
export type TuyaRoute =
  | { lan: Omit<CreateLocalTuyaClientOptions, "deviceId"> }
  | { gateway: LocalTuyaClient; nodeId: string }
  | { cloud: TuyaCloudAccount };

export interface CreateTuyaClientOptions {
  /** The device's ID, as the Tuya cloud gives it. */
  deviceId: string;
  /** The routes to reach the device by, at least one, in the order to try
   * them. */
  routes: readonly TuyaRoute[];
  /** The product key discovery reports or a cloud lists, for finding the
   * device's catalog entry. */
  productKey?: string;
  /** The category a cloud lists the device in. When the catalog lists no
   * entry for `productKey`, a cloud route's model of the device names its
   * controls, ahead of the entries that fit its data points: another kind of
   * device can report the same data points. Without it, those entries alone
   * name them. */
  category?: string;
  /** The catalog entry to name the device's controls by, such as the one
   * picked the last time. Defaults to the best entry found from `productKey`
   * and the data points the device reports. */
  entry?: TuyaDeviceEntry;
}

/** Builds a client for each route, reads the device's data points through
 * them to find its catalog entry unless `entry` is given, asks a cloud route
 * for the device's model when `category` is given and the catalog does not
 * list `productKey`, and resolves with
 * a `RoutedTuyaClient`. That read tries every route in order, connected or
 * not, so a LAN route listed first answers it once it connects, and the next
 * route answers only after the LAN fails within its own timeouts. When no
 * route answers, the entry is found from `productKey` alone. Read the data
 * points once it resolves: a report that arrived before had no listener.
 *
 * It rejects with a `TypeError` when given no route, and with the error a
 * route throws when it cannot be built, such as the `TypeError` of a LAN
 * route's `readByWritingNull` on 3.4 or 3.5, or of a gateway on 3.1 or 3.2,
 * after closing the clients of the routes before it. */
export async function createTuyaClient(
  options: CreateTuyaClientOptions,
): Promise<RoutedTuyaClient> {
  const { deviceId, productKey, category } = options;
  if (options.routes.length === 0) {
    throw new TypeError("A client needs at least one route");
  }
  const routes: TuyaClient[] = [];
  try {
    for (const route of options.routes) {
      routes.push(
        "lan" in route
          ? createLocalTuyaClient({ ...route.lan, deviceId })
          : "gateway" in route
            ? route.gateway.createClient(route.nodeId)
            : new CloudRoute(() => route.cloud.createClient(deviceId)),
      );
    }
  } catch (error) {
    await Promise.allSettled(routes.map((route) => route.close()));
    throw error;
  }
  if (options.entry) {
    return new RoutedTuyaClient(routes, [options.entry]);
  }
  const dataPoints = await sendThroughRoutes(
    routes,
    (route) => route.readDataPoints(),
    () => true,
    { skipsUnconnected: false },
  ).catch(() => undefined);
  const entries = findDeviceEntries({
    ...(productKey !== undefined && { productKey }),
    ...(dataPoints !== undefined && { dataPoints }),
  });
  const listed = entries.some((entry) =>
    entry.products.some((product) => product.productKey === productKey),
  );
  const modelEntry =
    category === undefined || listed
      ? undefined
      : await buildEntryFromModel(options.routes, deviceId, category);
  return new RoutedTuyaClient(
    routes,
    modelEntry ? [modelEntry, ...entries] : entries,
  );
}

async function buildEntryFromModel(
  routes: readonly TuyaRoute[],
  deviceId: string,
  category: string,
): Promise<TuyaDeviceEntry | undefined> {
  for (const route of routes) {
    if ("cloud" in route) {
      const model = await route.cloud
        .readDeviceModel(deviceId)
        .catch(() => undefined);
      const entry =
        model && createDeviceEntry(model, { category, name: deviceId });
      if (entry) {
        return entry;
      }
    }
  }
  return undefined;
}

// Source: A device reports each change over the LAN and to the cloud: the
// cloud's copy follows 5 s later in
// https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1,
// and goes out at once since
// https://github.com/tuya/TuyaOpen/commit/6b5458586756d2e535b578ecc65a7fac35d30b12.
/** One device, reached by several routes, with its controls named from the
 * device catalog. Create one with `createTuyaClient`.
 *
 * Each request starts at the first route, and skips a route that is not
 * connected unless it is the last. A read moves on to the next route after
 * any failure. A write moves on only after a failure that shows the route did
 * not deliver it, with code `CONNECTION_FAILED`,
 * `SESSION_KEY_NEGOTIATION_FAILED`, `RATE_LIMITED`, `SESSION_EXPIRED`,
 * `PERMISSION_DENIED` or `UNMAPPED_DATA_POINT`; after any other it rejects
 * with that error, as the device may have taken the write. A request that
 * fails on the one route it tried rejects with that route's error, and one
 * that fails on several with a `TuyaError` with code `ROUTES_FAILED`.
 *
 * It hands its listeners the data points of the first route that is
 * connected alone, as a device reports each change over every route. */
export class RoutedTuyaClient implements TuyaClient {
  /** The candidates for the device, best first: the entry built from a cloud's
   * model, if any, then the catalog's; or the entry `createTuyaClient` was
   * given. */
  readonly entries: readonly TuyaDeviceEntry[];
  /** The entry the controls are named by: the first of `entries`. */
  readonly entry: TuyaDeviceEntry | undefined;
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
  // The data points the device reported last, or this client wrote last,
  // which a masked control's write keeps the other bits of.
  private readonly latest: Record<string, DataPointValue> = {};
  private writing: Promise<unknown> = Promise.resolve();
  private closing: Promise<void> | undefined;

  constructor(
    private readonly routes: readonly TuyaClient[],
    entries: readonly TuyaDeviceEntry[],
  ) {
    this.entries = entries;
    this.entry = entries[0];
    routes.forEach((route, index) => {
      route.onDataPoints((dataPoints) => {
        if (!routes.slice(0, index).some((earlier) => earlier.connected)) {
          Object.assign(this.latest, dataPoints);
          for (const listener of this.listeners) {
            listener(dataPoints);
          }
        }
      });
    });
  }

  /** Whether any route is connected. */
  get connected(): boolean {
    return this.routes.some((route) => route.connected);
  }

  async readDataPoints(): Promise<DataPoints> {
    const dataPoints = await sendThroughRoutes(
      this.routes,
      (route) => route.readDataPoints(),
      () => true,
    );
    Object.assign(this.latest, dataPoints);
    return dataPoints;
  }

  async writeDataPoints(dataPoints: DataPoints): Promise<void> {
    await sendThroughRoutes(
      this.routes,
      (route) => route.writeDataPoints(dataPoints),
      (error) =>
        error instanceof TuyaError && UNDELIVERED_WRITE_CODES.has(error.code),
    );
    Object.assign(this.latest, dataPoints);
  }

  onDataPoints(listener: (dataPoints: DataPoints) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Reads the device's data points and names them by `entry`. It rejects
   * with a `TuyaError` with code `NO_CATALOG_ENTRY` when there is none. */
  async readControls(): Promise<ControlValues> {
    const entry = this.requireEntry();
    return readControls(entry, await this.readDataPoints());
  }

  /** Writes the data points that set `values`, by `entry`. It rejects with a
   * `TuyaError` with code `NO_CATALOG_ENTRY` when there is none, a
   * `TypeError` for a control the entry does not have or a read-only one, and
   * a `RangeError` for a value outside the data point's range. A control with
   * a `mask` keeps the other bits of its data point as the device last
   * reported them, read first if it has not, so one write runs at a time:
   * two writes to one colour's hue and saturation each keep the other's. */
  async writeControls(values: ControlValues): Promise<void> {
    const entry = this.requireEntry();
    const write = this.writing.then(() => this.writeNamed(entry, values));
    this.writing = write.catch(() => {});
    await write;
  }

  /** Calls `listener` with the controls whose data points the device
   * reports, as they arrive. Returns a function that removes the listener.
   * It throws a `TuyaError` with code `NO_CATALOG_ENTRY` when there is no
   * `entry`. */
  onControls(listener: (values: ControlValues) => void): () => void {
    const entry = this.requireEntry();
    return this.onDataPoints((dataPoints) => {
      const values = readReportedControls(entry, this.latest, dataPoints);
      if (Object.keys(values).length > 0) {
        listener(values);
      }
    });
  }

  /** Closes the client of every route, and resolves once they are released.
   * It leaves the gateways' clients and the cloud accounts open: they belong
   * to the caller. */
  close(): Promise<void> {
    this.listeners.clear();
    this.closing ??= Promise.all(
      this.routes.map((route) => route.close()),
    ).then(() => {});
    return this.closing;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private async writeNamed(
    entry: TuyaDeviceEntry,
    values: ControlValues,
  ): Promise<void> {
    const unknown = Object.entries(values).some(([componentName, controls]) =>
      Object.keys(controls).some((name) => {
        const control = entry.components[componentName]?.[name];
        if (!control) {
          return false;
        }
        const needed = [
          ...(control.mask !== undefined ? [control.dataPoint] : []),
          ...listDependencies(control),
        ];
        return needed.some((id) => this.latest[id] === undefined);
      }),
    );
    if (unknown) {
      await this.readDataPoints();
    }
    await this.writeDataPoints(writeControls(entry, values, this.latest));
  }

  private requireEntry(): TuyaDeviceEntry {
    if (!this.entry) {
      throw new TuyaError(
        "NO_CATALOG_ENTRY",
        "The device catalog has no entry for the device",
      );
    }
    return this.entry;
  }
}

async function sendThroughRoutes<T>(
  routes: readonly TuyaClient[],
  send: (route: TuyaClient) => Promise<T>,
  movesOn: (error: unknown) => boolean,
  { skipsUnconnected = true }: { skipsUnconnected?: boolean } = {},
): Promise<T> {
  const failures: { index: number; error: unknown }[] = [];
  for (const [index, route] of routes.entries()) {
    if (skipsUnconnected && !route.connected && index < routes.length - 1) {
      continue;
    }
    try {
      return await send(route);
    } catch (error) {
      if (!movesOn(error)) {
        throw error;
      }
      failures.push({ index, error });
    }
  }
  if (failures.length === 1) {
    throw failures[0]?.error;
  }
  throw new TuyaError(
    "ROUTES_FAILED",
    `Every route failed: ${failures
      .map(
        ({ index, error }) =>
          `route ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      )
      .join("; ")}`,
    { cause: new AggregateError(failures.map(({ error }) => error)) },
  );
}

// A push carries some data points alone, so the controls are read from the
// latest of every data point, and a control is reported when the push carries
// its data point or one it depends on or reads instead: a change of unit
// changes how a temperature reads.
function readReportedControls(
  entry: TuyaDeviceEntry,
  latest: DataPoints,
  pushed: DataPoints,
): ControlValues {
  const reported: Record<string, Record<string, ControlValue>> = {};
  for (const [componentName, values] of Object.entries(
    readControls(entry, latest),
  )) {
    const component: Record<string, ControlValue> = {};
    for (const [name, value] of Object.entries(values)) {
      const control = entry.components[componentName]?.[name];
      if (
        control &&
        [control.dataPoint, ...listDependencies(control)].some(
          (id) => id in pushed,
        )
      ) {
        component[name] = value;
      }
    }
    if (Object.keys(component).length > 0) {
      reported[componentName] = component;
    }
  }
  return reported;
}
