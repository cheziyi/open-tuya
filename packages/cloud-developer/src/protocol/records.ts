// Source: Each field below as the sources read it and the responses captured
// in https://github.com/jasonacox/tinytuya/issues/330,
// https://github.com/tuya/tuya-home-assistant/issues/55,
// https://github.com/jasonacox/tinytuya/issues/537,
// https://github.com/xZetsubou/hass-localtuya/issues/782#issuecomment-3958114610
// and https://github.com/tuya/tuya-home-assistant/issues/591 carry it.

export interface Envelope {
  success?: boolean;
  result?: unknown;
  code?: number | string;
  msg?: string;
}

export interface TokenResult {
  access_token?: unknown;
  /** In seconds, from now. */
  expire_time?: unknown;
  uid?: unknown;
}

export interface DeviceRecord {
  id: string;
  name: string;
  /** Missing or empty on some devices in the list of every linked account,
   * though the list of their own account carries it. */
  local_key?: string;
  product_id: string;
  category: string;
  online: boolean;
  // Source: A device behind a gateway carries `node_id` in this list, which
  // hass-localtuya reads off it, in
  // https://github.com/xZetsubou/hass-localtuya/commit/cd476b42aecf742437acdcf588a19b01731b4c6f.
  node_id?: string;
  /** The app account the device belongs to. */
  uid?: string;
}

/** A page of `/v1.0/iot-01/associated-users/devices` in `devices`, or of
 * `/v1.3/iot-03/devices` in `list`. */
export interface DevicePage {
  devices?: DeviceRecord[];
  list?: DeviceRecord[];
  has_more?: boolean;
  last_row_key?: string;
}

export interface DeviceDetail {
  uid?: unknown;
}

export interface ThingModel {
  /** JSON text of `{ services: [{ properties: ThingProperty[] }] }`. */
  model?: unknown;
}

export interface ThingProperty {
  abilityId: number;
  code: string;
  /** Such as `{ type: "value", min: 0, max: 100, step: 1, unit: "%",
   * scale: 0 }`. */
  typeSpec?: unknown;
}

export interface ShadowProperties {
  properties?: { dp_id?: number | null; value?: unknown }[];
}

export interface PushConfigRecord {
  url?: unknown;
  client_id?: unknown;
  username?: unknown;
  password?: unknown;
  /** In seconds. */
  expire_time?: unknown;
  source_topic?: { device?: unknown } | null;
}

export interface PushEnvelope {
  protocol?: number;
  t?: number;
  data?: string;
}

export interface PushData {
  devId?: string;
  /** Each entry holds the device's own value under its data point ID, and
   * the cloud's converted value under `value`. */
  status?: Record<string, unknown>[];
}
