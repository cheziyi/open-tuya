/** Resolves after `timeInMs`, or rejects with the signal's reason once it
 * aborts. */
export function delay(timeInMs: number, signal?: AbortSignal): Promise<void> {
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
