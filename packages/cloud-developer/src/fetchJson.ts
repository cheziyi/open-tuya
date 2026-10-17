import { TuyaError } from "@open-tuya/core";

const REQUEST_TIMEOUT_IN_MS = 10_000;
const TOO_MANY_REQUESTS = 429;

export type Fetch = typeof globalThis.fetch;

/** Sends a request and reads its JSON. It rejects with a `TuyaError` with
 * code `REQUEST_TIMED_OUT` when no answer comes within 10 s,
 * `CONNECTION_FAILED` when none can be sent, `RATE_LIMITED` on HTTP 429, and
 * `REQUEST_REJECTED` on any other HTTP error or a body that is not JSON. Once
 * `signal` aborts, it rejects with the signal's reason. */
export async function fetchJson(
  fetch: Fetch,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_IN_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal,
    });
    if (response.status === TOO_MANY_REQUESTS) {
      throw new TuyaError("RATE_LIMITED", "The cloud answered HTTP 429");
    }
    if (!response.ok) {
      throw new TuyaError(
        "REQUEST_REJECTED",
        `The cloud answered HTTP ${response.status}`,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof TuyaError) {
      throw error;
    }
    if (signal?.aborted) {
      throw signal.reason;
    }
    if (timeout.signal.aborted) {
      throw new TuyaError(
        "REQUEST_TIMED_OUT",
        `The cloud did not answer within ${REQUEST_TIMEOUT_IN_MS} ms`,
      );
    }
    if (error instanceof SyntaxError) {
      throw new TuyaError(
        "REQUEST_REJECTED",
        "The cloud's answer is not JSON",
        {
          cause: error,
        },
      );
    }
    throw new TuyaError("CONNECTION_FAILED", "The cloud could not be reached", {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}
