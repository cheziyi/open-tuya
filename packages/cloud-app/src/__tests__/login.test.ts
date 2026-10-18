import type { Fetch } from "@open-tuya/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QrLogin } from "../login.js";

// Source: Home Assistant's client ID and schema, in
// https://github.com/home-assistant/core/blob/82e1ed43f85b3254c51e7a8200ece159019743ab/homeassistant/components/tuya/const.py#L39-L40.
const OPTIONS = {
  clientId: "HA_3y9q4ak7g4ephrvke",
  schema: "haauthorize",
  userCode: "AbC123",
};
// Source: A QR token's form, captured in
// https://github.com/home-assistant/core/issues/114797.
const TOKEN = "AZ1712188152186pKxANZZDFcNgXHxnIKSsjUamlo178365845218603";
const QR_CODE = `tuyaSmart--qrLogin?token=${TOKEN}`;

interface Sent {
  method: string;
  url: URL;
}

// A fetch that answers each request with the next of `answers`, and records
// it. It returns a `Response` as it is, throws an `Error`, and sends anything
// else as JSON.
function fakeFetch(answers: unknown[]): { fetch: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetch: Fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    sent.push({ method: init?.method ?? "GET", url: new URL(String(input)) });
    const answer = answers.shift();
    if (answer instanceof Error) {
      throw answer;
    }
    return answer instanceof Response ? answer : Response.json(answer);
  };
  return { fetch, sent };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("QrLogin", () => {
  it("requests a QR code with the client ID, user code and schema", async () => {
    const { fetch, sent } = fakeFetch([
      { success: true, t: 1, result: { qrcode: TOKEN } },
    ]);

    await expect(new QrLogin(fetch, OPTIONS).requestQrCode()).resolves.toBe(
      QR_CODE,
    );
    expect(sent.map(({ method, url }) => [method, url.href])).toEqual([
      [
        "POST",
        "https://apigw.iotbing.com/v1.0/m/life/home-assistant/qrcode/tokens?clientid=HA_3y9q4ak7g4ephrvke&usercode=AbC123&schema=haauthorize",
      ],
    ]);
  });

  it("rejects with REQUEST_REJECTED when the cloud refuses a QR code", async () => {
    const { fetch } = fakeFetch([
      { success: false, code: "1004", msg: "user code invalid" },
    ]);

    await expect(
      new QrLogin(fetch, OPTIONS).requestQrCode(),
    ).rejects.toMatchObject({ code: "REQUEST_REJECTED" });
  });

  it("polls every 2 s until the login is confirmed, and resolves with the session", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(1_700_000_000_000);
    const { fetch, sent } = fakeFetch([
      {
        success: false,
        msg: "Login failed, please scan and try again!",
      },
      {
        success: true,
        t: 1_700_000_002_000,
        result: {
          access_token: "access",
          refresh_token: "refresh",
          expire_time: 7200,
          uid: "eu0000000000000aaaa",
          terminal_id: "1717016004490TPIQv9",
          endpoint: "https://apigw.tuyaeu.com",
          username: "user@example.com",
        },
      },
    ]);

    const session = new QrLogin(fetch, OPTIONS).waitForScan(QR_CODE);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(session).resolves.toEqual({
      endpoint: "https://apigw.tuyaeu.com",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAtInMs: 1_700_000_002_000 + 7_200_000,
    });
    expect(sent.map(({ method, url }) => [method, url.href])).toEqual(
      Array(2).fill([
        "GET",
        `https://apigw.iotbing.com/v1.0/m/life/home-assistant/qrcode/tokens/${TOKEN}?clientid=HA_3y9q4ak7g4ephrvke&usercode=AbC123`,
      ]),
    );
  });

  it("polls on through a rate limit and a connection that fails", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetch, sent } = fakeFetch([
      new Response("", { status: 429 }),
      new TypeError("fetch failed"),
      {
        success: true,
        result: {
          access_token: "access",
          refresh_token: "refresh",
          expire_time: 7200,
          endpoint: "https://apigw.tuyaeu.com",
        },
      },
    ]);

    const session = new QrLogin(fetch, OPTIONS).waitForScan(QR_CODE);
    await vi.advanceTimersByTimeAsync(4000);

    await expect(session).resolves.toMatchObject({ accessToken: "access" });
    expect(sent).toHaveLength(3);
  });

  it("rejects with REQUEST_REJECTED when the cloud answers an HTTP error", async () => {
    const { fetch } = fakeFetch([new Response("", { status: 500 })]);

    await expect(
      new QrLogin(fetch, OPTIONS).waitForScan(QR_CODE),
    ).rejects.toMatchObject({ code: "REQUEST_REJECTED" });
  });

  it("rejects with QR_CODE_EXPIRED once the cloud says the QR code expired", async () => {
    // Source: Captured in https://github.com/home-assistant/core/issues/140855.
    const { fetch } = fakeFetch([
      {
        success: false,
        code: "E0020002",
        msg: "The QR code has expired, please close the page and reinstall integration",
      },
    ]);

    await expect(
      new QrLogin(fetch, OPTIONS).waitForScan(QR_CODE),
    ).rejects.toMatchObject({ code: "QR_CODE_EXPIRED" });
  });

  it("rejects with the signal's reason once it aborts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetch } = fakeFetch(
      Array(3).fill({ success: false, code: "E0020003", msg: "Not yet" }),
    );
    const controller = new AbortController();

    const session = new QrLogin(fetch, OPTIONS).waitForScan(QR_CODE, {
      signal: controller.signal,
    });
    const rejected = expect(session).rejects.toBe("stopped");
    await vi.advanceTimersByTimeAsync(2000);
    controller.abort("stopped");

    await rejected;
  });
});
