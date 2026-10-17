// Source: Each field below as the SDK reads it, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1
// and https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13,
// and as the responses captured in
// https://github.com/home-assistant-libs/tuya-device-handlers/issues/472#issuecomment-5546380301
// and https://github.com/home-assistant/core/issues/162625 carry it.

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  /** In seconds. */
  expire_time: number;
  endpoint: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  /** In seconds. */
  expireTime: number;
}

export interface HomeRecord {
  ownerId: string | number;
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
  status?: { code: string; value: unknown }[];
}

export interface StatusRelation {
  dpId: number;
  statusCode: string;
  supportLocal: boolean;
  valueConvert: string;
}

export interface StatusRelations {
  dpStatusRelationDTOS?: StatusRelation[];
}

export interface PushConfigRecord {
  url: string;
  clientId: string;
  username: string;
  password: string;
  /** In seconds. */
  expireTime: number;
  topic: { devId: { sub: string } };
}

export interface PushMessage {
  protocol?: number;
  data?: {
    devId?: string;
    status?: { dpId?: number; value?: unknown }[];
  };
}
