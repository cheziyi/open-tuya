import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

export interface CloudRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
}

export type CloudAnswer =
  | { result: unknown }
  | { code: number | string; msg: string }
  | { status: number };

type Handler = (request: CloudRequest) => CloudAnswer | Promise<CloudAnswer>;

/** The developer platform behind one data center, as a `fetch`. It checks
 * each request's signature with its own code, issues a token on
 * GET /v1.0/token?grant_type=1, and takes only the token it issued last. */
export class FakeDeveloperCloud {
  readonly origin = "https://openapi.tuyaeu.com";
  readonly uid = "bay1671210199361OQS3";
  readonly requests: CloudRequest[] = [];
  /** Requests whose signature was wrong. */
  readonly badSignatures: CloudRequest[] = [];
  /** How long each token lasts. */
  expireTimeInSeconds = 7200;
  /** While true, the cloud answers 1010 to all but a token request. */
  tokenExpired = false;
  /** Answers the next token requests with these, in place of a token. */
  readonly tokenFailures: CloudAnswer[] = [];
  private accessToken: string | undefined;
  private issued = 0;
  private readonly handlers = new Map<string, Handler>();

  constructor(
    readonly clientId: string,
    readonly secret: string,
  ) {}

  tokensIssued(): number {
    return this.issued;
  }

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
    const body = init?.body === undefined ? "" : String(init.body);
    const query = Object.fromEntries(url.searchParams);
    const request: CloudRequest = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query,
      ...(body && { body: JSON.parse(body) }),
      headers,
    };
    this.requests.push(request);
    const sortedQuery = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join("&");
    const signed =
      this.clientId +
      (headers.access_token ?? "") +
      headers.t +
      [
        request.method,
        createHash("sha256").update(body).digest("hex"),
        "",
        url.pathname + (sortedQuery && `?${sortedQuery}`),
      ].join("\n");
    const expected = createHmac("sha256", this.secret)
      .update(signed)
      .digest("hex")
      .toUpperCase();
    const isTokenRequest =
      url.pathname === "/v1.0/token" && query.grant_type === "1";
    let answer: CloudAnswer;
    if (headers.client_id !== this.clientId || headers.sign !== expected) {
      this.badSignatures.push(request);
      answer = { code: 1004, msg: "sign invalid" };
    } else if (isTokenRequest) {
      answer = this.tokenFailures.shift() ?? this.issueToken();
    } else if (headers.access_token !== this.accessToken || this.tokenExpired) {
      answer = { code: 1010, msg: "token invalid" };
    } else {
      const handler = this.handlers.get(`${request.method} ${request.path}`);
      answer = handler
        ? await handler(request)
        : { code: 1108, msg: "uri path invalid" };
    }
    if ("status" in answer) {
      return new Response("", { status: answer.status });
    }
    if ("result" in answer) {
      return Response.json({
        result: answer.result,
        success: true,
        t: Date.now(),
      });
    }
    return Response.json({ ...answer, success: false, t: Date.now() });
  }

  private issueToken(): CloudAnswer {
    this.issued++;
    this.accessToken = `token-${this.issued}`;
    this.tokenExpired = false;
    return {
      result: {
        access_token: this.accessToken,
        expire_time: this.expireTimeInSeconds,
        refresh_token: `refresh-${this.issued}`,
        uid: this.uid,
      },
    };
  }
}

/** A pushed message as the broker sends it: `data` encrypted under the
 * password's 9th to 24th characters, with `t` as decimal text for the
 * additional data. A `protocol` of null leaves the field out. */
export function encryptPushMessage(
  data: unknown,
  password: string,
  t: number,
  protocol: number | null = 4,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-128-gcm",
    Buffer.from(password.slice(8, 24)),
    iv,
  );
  cipher.setAAD(Buffer.from(String(t)));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(iv.length);
  const sealed = Buffer.concat([
    length,
    iv,
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return JSON.stringify({
    data: sealed.toString("base64"),
    ...(protocol !== null && { protocol }),
    pv: "2.0",
    sign: "00000000000000000000000000000000",
    t,
  });
}
