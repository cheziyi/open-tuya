import {
  type DataPoints,
  type TuyaClient,
  type TuyaCloudAccount,
  TuyaError,
  type TuyaErrorCode,
} from "@open-tuya/core";
import {
  type ControlValue,
  type ControlValues,
  findDeviceEntries,
  readControls,
  type TuyaDeviceEntry,
  writeControls,
} from "@open-tuya/devices";
import {
  type CreateLocalTuyaClientOptions,
  createLocalTuyaClient,
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
 * a cloud's local key, or through a cloud account. The LAN route keeps its
 * `host`: when discovery reports a new one, create a new client. A device
 * reached through a gateway, one with a `nodeId`, takes a cloud route alone,
 * as `@open-tuya/local` does not address a gateway's devices. */
export type TuyaRoute =
  | { lan: Omit<CreateLocalTuyaClientOptions, "deviceId"> }
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
  /** The catalog entry to name the device's controls by, such as the one
   * picked the last time. Defaults to the best entry found from `productKey`
   * and the data points the device reports. */
  entry?: TuyaDeviceEntry;
}

/** Builds a client for each route, reads the device's data points through
 * them to find its catalog entry unless `entry` is given, and resolves with
 * a `RoutedTuyaClient`. When no route answers that read, the entry is found
 * from `productKey` alone. Read the data points once it resolves: a report
 * that arrived before had no listener. */
export async function createTuyaClient(
  options: CreateTuyaClientOptions,
): Promise<RoutedTuyaClient> {
  const { deviceId, productKey } = options;
  if (options.routes.length === 0) {
    throw new TypeError("A client needs at least one route");
  }
  const routes = options.routes.map((route) =>
    "lan" in route
      ? createLocalTuyaClient({ ...route.lan, deviceId })
      : new CloudRoute(() => route.cloud.createClient(deviceId)),
  );
  if (options.entry) {
    return new RoutedTuyaClient(routes, [options.entry]);
  }
  const dataPoints = await sendThroughRoutes(
    routes,
    (route) => route.readDataPoints(),
    () => true,
  ).catch(() => undefined);
  return new RoutedTuyaClient(
    routes,
    findDeviceEntries({
      ...(productKey !== undefined && { productKey }),
      ...(dataPoints !== undefined && { dataPoints }),
    }),
  );
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
  /** The catalog's candidates for the device, best first, or the entry
   * `createTuyaClient` was given. */
  readonly entries: readonly TuyaDeviceEntry[];
  /** The entry the controls are named by: the first of `entries`. */
  readonly entry: TuyaDeviceEntry | undefined;
  private readonly listeners = new Set<(dataPoints: DataPoints) => void>();
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

  readDataPoints(): Promise<DataPoints> {
    return sendThroughRoutes(
      this.routes,
      (route) => route.readDataPoints(),
      () => true,
    );
  }

  writeDataPoints(dataPoints: DataPoints): Promise<void> {
    return sendThroughRoutes(
      this.routes,
      (route) => route.writeDataPoints(dataPoints),
      (error) =>
        error instanceof TuyaError && UNDELIVERED_WRITE_CODES.has(error.code),
    );
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
   * a `RangeError` for a value outside the data point's range. */
  async writeControls(values: ControlValues): Promise<void> {
    await this.writeDataPoints(writeControls(this.requireEntry(), values));
  }

  /** Calls `listener` with the controls whose data points the device
   * reports, as they arrive. Returns a function that removes the listener.
   * It throws a `TuyaError` with code `NO_CATALOG_ENTRY` when there is no
   * `entry`. */
  onControls(listener: (values: ControlValues) => void): () => void {
    const entry = this.requireEntry();
    return this.onDataPoints((dataPoints) => {
      const values = readReportedControls(entry, dataPoints);
      if (Object.keys(values).length > 0) {
        listener(values);
      }
    });
  }

  /** Closes the client of every route, and resolves once they are released.
   * It leaves the cloud accounts open: they belong to the caller. */
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
): Promise<T> {
  const failures: { index: number; error: unknown }[] = [];
  for (const [index, route] of routes.entries()) {
    if (!route.connected && index < routes.length - 1) {
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

// A push carries some data points alone, so a control whose data point it
// leaves out is left out, rather than read as absent.
function readReportedControls(
  entry: TuyaDeviceEntry,
  dataPoints: DataPoints,
): ControlValues {
  const reported: Record<string, Record<string, ControlValue>> = {};
  for (const [componentName, values] of Object.entries(
    readControls(entry, dataPoints),
  )) {
    const component: Record<string, ControlValue> = {};
    for (const [name, value] of Object.entries(values)) {
      const control = entry.components[componentName]?.[name];
      if (control && control.dataPoint in dataPoints) {
        component[name] = value;
      }
    }
    if (Object.keys(component).length > 0) {
      reported[componentName] = component;
    }
  }
  return reported;
}
