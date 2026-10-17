import type { TuyaClient } from "./client.js";

/** A device as a cloud lists it. `deviceId` and `localKey` are what a LAN
 * client takes; no cloud gives the device's LAN address or protocol version,
 * which discovery reports. */
export interface TuyaCloudDevice {
  deviceId: string;
  name: string;
  productKey: string;
  /** Missing on some gateways. */
  localKey?: string;
  category: string;
  online: boolean;
  /** The device's address on its gateway, on a device reached through one. */
  nodeId?: string;
}

/** An account on a Tuya cloud, signed in. `await using` closes it at the end
 * of its scope. */
export interface TuyaCloudAccount extends AsyncDisposable {
  listDevices(): Promise<TuyaCloudDevice[]>;
  /** Resolves with a client for the device, reached through the cloud. */
  createClient(deviceId: string): Promise<TuyaClient>;
  /** Stops every request in flight and the account's push connection, and
   * resolves once it is released. */
  close(): Promise<void>;
}
