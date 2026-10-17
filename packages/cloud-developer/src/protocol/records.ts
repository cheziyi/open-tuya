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
  access_token: string;
  /** In seconds, from now. */
  expire_time: number;
  uid: string;
}

export interface DeviceRecord {
  id: string;
  name: string;
  /** Missing on some gateways. */
  local_key?: string;
  product_id: string;
  category: string;
  online: boolean;
  node_id?: string;
}

export interface DevicePage {
  devices?: DeviceRecord[];
  has_more?: boolean;
  last_row_key?: string;
}

export interface DeviceDetail {
  uid: string;
}

export interface ThingModel {
  /** JSON text of `{ services: [{ properties: ThingProperty[] }] }`. */
  model: string;
}

export interface ThingProperty {
  abilityId: number;
  code: string;
}

export interface ShadowProperties {
  properties?: { dp_id?: number; value?: unknown }[];
}

export interface PushConfigRecord {
  url: string;
  client_id: string;
  username: string;
  password: string;
  /** In seconds. */
  expire_time: number;
  source_topic: { device: string };
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
