import { type Fetch, fetchJson, TuyaError } from "@open-tuya/core";
import type { LoginResult } from "./protocol/records.js";
import { parseResponse } from "./protocol/response.js";
import type { CloudAppSession } from "./session.js";

// Source: The login requests go to this host whatever the account's region,
// in https://github.com/tuya/tuya-device-sharing-sdk/commit/ae5e3c4c67eaefffd1be79e39d9f411e43515d13.
const LOGIN_ORIGIN = "https://apigw.iotbing.com";
// Source: The QR code encodes this text and the token, in
// https://github.com/home-assistant/core/commit/b553bb71e67ae979b4a5afcf7c6296b046d410f1.
const QR_CODE_PREFIX = "tuyaSmart--qrLogin?token=";
// Source: The cloud answers a poll for an expired QR code with this code, in
// https://github.com/home-assistant/core/issues/140855.
const QR_CODE_EXPIRED = "E0020002";
const POLL_INTERVAL_IN_MS = 2000;

export interface CreateQrLoginOptions {
  /** The client ID Tuya issued to the application signing in. The README
   * names the one known to work. */
  clientId: string;
  /** The schema Tuya issued with the client ID. */
  schema: string;
  /** The User Code the Smart Life or Tuya Smart app shows under Settings >
   * Account and Security. It is case-sensitive. */
  userCode: string;
}

export interface WaitForScanOptions {
  /** Stops the wait: `waitForScan` rejects with the signal's reason. */
  signal?: AbortSignal;
}

/** Signs in to the cloud the way the Smart Life app's QR login does: see
 * `QrLogin`. */
export function createQrLogin(options: CreateQrLoginOptions): QrLogin {
  return new QrLogin(fetch, options);
}

// Source: A QR code is requested with POST and the result fetched with GET,
// both unsigned, carrying the client ID and the user code, in
// https://github.com/tuya/tuya-device-sharing-sdk/commit/3e0d9ae6eb5e23e97ce7697a1bd3b248fe2c75b1.
/** Shows a QR code for the user to scan with the Smart Life or Tuya Smart
 * app, and waits for them to confirm the login there. */
export class QrLogin {
  constructor(
    private readonly fetch: Fetch,
    private readonly options: CreateQrLoginOptions,
  ) {}

  /** Resolves with the text to show as a QR code. It rejects with a
   * `TuyaError` with code `REQUEST_REJECTED` when the cloud refuses, as it
   * does a wrong user code. */
  async requestQrCode(): Promise<string> {
    const url = this.url("");
    url.searchParams.set("schema", this.options.schema);
    const response = parseResponse(
      await fetchJson(this.fetch, url.href, { method: "POST" }),
    );
    if (!response.success) {
      throw new TuyaError(
        "REQUEST_REJECTED",
        `The cloud answered ${response.code}: ${response.message}`,
      );
    }
    return QR_CODE_PREFIX + (response.result as { qrcode: string }).qrcode;
  }

  /** Polls the cloud every 2 s until the user confirms the login in the app,
   * and resolves with the session. It rejects with a `TuyaError` with code
   * `QR_CODE_EXPIRED` once `qrCode` expires: request a new one. */
  async waitForScan(
    qrCode: string,
    options: WaitForScanOptions = {},
  ): Promise<CloudAppSession> {
    const url = this.url(`/${qrCode.slice(QR_CODE_PREFIX.length)}`);
    for (;;) {
      const response = parseResponse(
        await fetchJson(
          this.fetch,
          url.href,
          { method: "GET" },
          options.signal,
        ),
      );
      if (response.success) {
        const result = response.result as LoginResult;
        return {
          endpoint: result.endpoint,
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAtInMs: Date.now() + result.expire_time * 1000,
        };
      }
      // No source shows what the cloud answers before the scan, so every
      // other answer means "not yet".
      if (response.code === QR_CODE_EXPIRED) {
        throw new TuyaError("QR_CODE_EXPIRED", "The QR code expired");
      }
      await delay(POLL_INTERVAL_IN_MS, options.signal);
    }
  }

  private url(suffix: string): URL {
    const url = new URL(
      `${LOGIN_ORIGIN}/v1.0/m/life/home-assistant/qrcode/tokens${suffix}`,
    );
    url.searchParams.set("clientid", this.options.clientId);
    url.searchParams.set("usercode", this.options.userCode);
    return url;
  }
}

function delay(timeInMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, timeInMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
