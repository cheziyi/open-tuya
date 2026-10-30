import type { TuyaClient } from "./client.js";
import type { TuyaDeviceModel } from "./deviceModel.js";

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
  /** Resolves with what the device's data points stand for, as the cloud's
   * model of the device says. A data point the cloud describes only in its
   * own terms, not the device's, is left out. */
  readDeviceModel(deviceId: string): Promise<TuyaDeviceModel>;
  /** Stops every request in flight and the account's push connection, and
   * resolves once it is released. */
  close(): Promise<void>;
}
