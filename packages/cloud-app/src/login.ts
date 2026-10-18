import {
  type Fetch,
  fetchJson,
  TuyaError,
  type TuyaErrorCode,
} from "@open-tuya/core";
import { delay } from "./delay.js";
import { readLoginResult, readQrCodeResult } from "./protocol/records.js";
import { type CloudResponse, parseResponse } from "./protocol/response.js";
import type { AppCloudSession } from "./session.js";

// Source: The login requests go to this host whatever the account's region,
// in https://github.com/tuya/tuya-device-sharing-sdk/commit/3e7706e12c7a0d5b61e70340a7a7ae83c675b67e.
const LOGIN_ORIGIN = "https://apigw.iotbing.com";
// Source: The QR code encodes this text and the token, in
// https://github.com/home-assistant/core/commit/82e1ed43f85b3254c51e7a8200ece159019743ab
// (https://github.com/home-assistant/core/pull/109155).
const QR_CODE_PREFIX = "tuyaSmart--qrLogin?token=";
// Source: The cloud answers a poll for an expired QR code with this code, in
// https://github.com/home-assistant/core/issues/140855.
const QR_CODE_EXPIRED = "E0020002";
// A scan is noticed within 2 s, at a request every 2 s against the cloud's rate
// limit: no source polls, so none sets the interval.
const POLL_INTERVAL_IN_MS = 2000;
const TRANSIENT_ERROR_CODES: ReadonlySet<TuyaErrorCode> = new Set([
  "REQUEST_TIMED_OUT",
  "CONNECTION_FAILED",
  "RATE_LIMITED",
]);

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
  /** Stops the wait: `waitForScan` rejects with the signal's reason. Pass
   * one to bound the wait, as it polls on while the cloud cannot be
   * reached. */
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
    return QR_CODE_PREFIX + readQrCodeResult(response.result).qrcode;
  }

  /** Polls the cloud every 2 s until the user confirms the login in the app,
   * and resolves with the session. It polls on through a poll that times
   * out, cannot connect or is rate limited. It rejects with a `TuyaError`
   * with code `QR_CODE_EXPIRED` once `qrCode` expires: request a new one;
   * with code `REQUEST_REJECTED` when the cloud answers an HTTP error, or a
   * session without a field it needs; and with the signal's reason once it
   * aborts. */
  async waitForScan(
    qrCode: string,
    options: WaitForScanOptions = {},
  ): Promise<AppCloudSession> {
    const url = this.url(`/${qrCode.slice(QR_CODE_PREFIX.length)}`);
    for (;;) {
      const response = await this.poll(url, options.signal);
      if (response?.success) {
        const result = readLoginResult(response.result);
        return {
          endpoint: result.endpoint,
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAtInMs: Date.now() + result.expire_time * 1000,
        };
      }
      // No source shows what the cloud answers before the scan, so every
      // other answer means "not yet".
      if (response?.code === QR_CODE_EXPIRED) {
        throw new TuyaError("QR_CODE_EXPIRED", "The QR code expired");
      }
      await delay(POLL_INTERVAL_IN_MS, options.signal);
    }
  }

  // Resolves with nothing when the poll failed in a way the next one may not.
  private async poll(
    url: URL,
    signal: AbortSignal | undefined,
  ): Promise<CloudResponse | undefined> {
    try {
      return parseResponse(
        await fetchJson(this.fetch, url.href, { method: "GET" }, signal),
      );
    } catch (error) {
      if (
        !signal?.aborted &&
        error instanceof TuyaError &&
        TRANSIENT_ERROR_CODES.has(error.code)
      ) {
        return undefined;
      }
      throw error;
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
