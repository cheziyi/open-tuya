import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

export interface CloudRequest {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
}

export type CloudAnswer =
  | { result: unknown }
  | { code: string | number; msg: string }
  | { status: number };

type Handler = (request: CloudRequest) => CloudAnswer | Promise<CloudAnswer>;

const SIGNED_HEADERS = [
  "X-appKey",
  "X-requestId",
  "X-sid",
  "X-time",
  "X-token",
];

/** The cloud behind a session's endpoint, as a `fetch`. It checks each
 * request's signature with its own code, decrypts its query and body, and
 * encrypts each answer. It takes the access token it issued last, and on
 * GET /v1.0/m/token/{refreshToken} the refresh token it issued last, which
 * it then replaces. */
export class FakeCloud {
  readonly endpoint = "https://apigw.tuyaeu.com";
  readonly requests: CloudRequest[] = [];
  /** Requests whose signature was wrong. */
  readonly badSignatures: CloudRequest[] = [];
  accessToken = "access-1";
  refreshToken = "refresh-1";
  /** While true, the cloud answers "sign invalid" to all but a refresh. */
  accessTokenExpired = false;
  private issued = 1;
  private readonly handlers = new Map<string, Handler>();

  constructor(readonly clientId: string) {}

  on(method: string, path: string, handler: Handler): void {
    this.handlers.set(`${method} ${path}`, handler);
  }

  readonly fetch: typeof globalThis.fetch = (input, init) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal;
      signal?.throwIfAborted();
      signal?.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
      this.serve(String(input), init).then(resolve, reject);
    });

  private async serve(input: string, init?: RequestInit): Promise<Response> {
    const url = new URL(input);
    const headers = init?.headers as Record<string, string>;
    const requestId = headers["X-requestId"] ?? "";
    const refreshPath = `/v1.0/m/token/${this.refreshToken}`;
    const isRefresh = url.pathname === refreshPath;
    const signingKey = createHash("md5")
      .update(requestId + this.refreshToken)
      .digest("hex");
    const key = Buffer.from(
      createHmac("sha256", requestId)
        .update(signingKey)
        .digest("hex")
        .slice(0, 16),
    );
    const queryEncdata = url.searchParams.get("encdata") ?? "";
    const bodyEncdata = init?.body
      ? (JSON.parse(String(init.body)).encdata as string)
      : "";
    const request: CloudRequest = {
      method: init?.method ?? "GET",
      path: url.pathname,
      ...(queryEncdata && { query: JSON.parse(decrypt(queryEncdata, key)) }),
      ...(bodyEncdata && { body: JSON.parse(decrypt(bodyEncdata, key)) }),
      headers,
    };
    this.requests.push(request);
    const signed =
      SIGNED_HEADERS.filter((name) => headers[name])
        .map((name) => `${name}=${headers[name]}`)
        .join("||") +
      queryEncdata +
      bodyEncdata;
    const signatureHolds =
      headers["X-appKey"] === this.clientId &&
      headers["X-sign"] ===
        createHmac("sha256", signingKey).update(signed).digest("hex");
    if (!signatureHolds) {
      this.badSignatures.push(request);
    }
    const accepted =
      signatureHolds &&
      (isRefresh ||
        (headers["X-token"] === this.accessToken && !this.accessTokenExpired));
    const answer: CloudAnswer = !accepted
      ? { code: "-9999999", msg: "sign invalid" }
      : isRefresh
        ? this.refresh()
        : await this.answer(request);
    if ("status" in answer) {
      return new Response("", { status: answer.status });
    }
    if ("result" in answer) {
      return Response.json({
        success: true,
        t: Date.now(),
        result: encrypt(JSON.stringify(answer.result), key),
      });
    }
    return Response.json({ success: false, t: Date.now(), ...answer });
  }

  private answer(request: CloudRequest): CloudAnswer | Promise<CloudAnswer> {
    const handler = this.handlers.get(`${request.method} ${request.path}`);
    return handler ? handler(request) : { code: 1108, msg: "uri path invalid" };
  }

  private refresh(): CloudAnswer {
    this.issued++;
    this.accessToken = `access-${this.issued}`;
    this.refreshToken = `refresh-${this.issued}`;
    this.accessTokenExpired = false;
    return {
      result: {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expireTime: 7200,
        uid: "eu0000000000000aaaa",
      },
    };
  }
}

function encrypt(plaintext: string, key: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-128-gcm", key, nonce);
  return Buffer.concat([
    nonce,
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}

function decrypt(encrypted: string, key: Buffer): string {
  const bytes = Buffer.from(encrypted, "base64");
  const decipher = createDecipheriv("aes-128-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    decipher.update(bytes.subarray(12, -16)),
    decipher.final(),
  ]).toString();
}
