import { vi } from "vitest";

// The sockets stay real, so only the timers the connection sets are faked.
export function useFakeTimers(): void {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
}

// Waits on the clock, not on turns of the event loop: the timers are fake,
// but the sockets are not.
export async function until(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 2000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("The condition did not hold within 2 s");
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
