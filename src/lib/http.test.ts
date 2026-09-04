import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, fetchJson, resetRateLimitsForTests } from "./http";

beforeEach(() => resetRateLimitsForTests());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("upstream error handling", () => {
  it("retries transient failures", async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response("no", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await expect(fetchJson("https://example.test", {}, { retries: 1, timeoutMs: 100 })).resolves.toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("does not retry invalid client requests", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 })); vi.stubGlobal("fetch", mock);
    await expect(fetchJson("https://example.test", {}, { retries: 2, timeoutMs: 100 })).rejects.toThrow("400"); expect(mock).toHaveBeenCalledTimes(1);
  });
  it("releases a rate-limit bucket after its time window", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-14T10:00:00Z"));
    expect(checkRateLimit("visitor", 2, 1_000)).toBe(true);
    expect(checkRateLimit("visitor", 2, 1_000)).toBe(true);
    expect(checkRateLimit("visitor", 2, 1_000)).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit("visitor", 2, 1_000)).toBe(true);
  });
});
