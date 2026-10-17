import { type DataPoints, TuyaError } from "@open-tuya/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudRoute } from "../cloudRoute.js";
import { FakeTuyaCloudAccount } from "./mocks/fakeClient.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function route(account: FakeTuyaCloudAccount): CloudRoute {
  return new CloudRoute(() => account.createClient());
}

describe("CloudRoute", () => {
  it("builds its client when created, and is connected once built", async () => {
    const account = new FakeTuyaCloudAccount({ "1": true });
    const cloud = route(account);
    expect(cloud.connected).toBe(false);

    await expect(cloud.readDataPoints()).resolves.toEqual({ "1": true });
    expect(cloud.connected).toBe(true);
    expect(account.createCalls).toBe(1);
  });

  it("hands on what its client pushes", async () => {
    const account = new FakeTuyaCloudAccount();
    const cloud = route(account);
    const reports: DataPoints[] = [];
    cloud.onDataPoints((dataPoints) => reports.push(dataPoints));
    await cloud.readDataPoints();

    account.clients[0]?.push({ "1": false });

    expect(reports).toEqual([{ "1": false }]);
  });

  it("fails a request at once with the build's error, and builds again 5 s later, doubling", async () => {
    const account = new FakeTuyaCloudAccount();
    account.failure = new TuyaError("CONNECTION_FAILED", "Unreachable");
    const cloud = route(account);
    await vi.advanceTimersByTimeAsync(0);

    await expect(cloud.writeDataPoints({ "1": true })).rejects.toBe(
      account.failure,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(account.createCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(9999);
    expect(account.createCalls).toBe(2);
    account.failure = undefined;
    await vi.advanceTimersByTimeAsync(1);

    expect(account.createCalls).toBe(3);
    expect(cloud.connected).toBe(true);
  });

  it.each([
    new TuyaError("SESSION_EXPIRED", "Sign in again"),
    new TuyaError("PERMISSION_DENIED", "Renew the trial"),
    new TypeError("Not a TuyaError"),
  ])("does not build again after $message", async (error) => {
    const account = new FakeTuyaCloudAccount();
    account.failure = error;
    const cloud = route(account);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(account.createCalls).toBe(1);
    await expect(cloud.readDataPoints()).rejects.toBe(error);
  });

  it("closes its client, and rejects requests with CONNECTION_LOST once closed", async () => {
    const account = new FakeTuyaCloudAccount();
    const cloud = route(account);

    await cloud.close();

    expect(account.clients[0]?.closes).toBe(1);
    expect(cloud.connected).toBe(false);
    await expect(cloud.readDataPoints()).rejects.toMatchObject({
      code: "CONNECTION_LOST",
    });
  });

  it("stops building again once closed", async () => {
    const account = new FakeTuyaCloudAccount();
    account.failure = new TuyaError("CONNECTION_FAILED", "Unreachable");
    const cloud = route(account);
    await vi.advanceTimersByTimeAsync(0);

    await cloud.close();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(account.createCalls).toBe(1);
  });
});
