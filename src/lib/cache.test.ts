import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCache, resetCacheForTests } from "./cache";

describe("server cache", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-14T10:00:00Z"));
    delete process.env.DATABASE_URL; process.env.SQLITE_PATH = ":memory:"; resetCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers(); delete process.env.SQLITE_PATH; resetCacheForTests();
  });

  it("returns fresh values and supports an explicit stale fallback", async () => {
    const cache = getCache();
    await cache.set("forecast:test", { score: 88 }, 30);
    await expect(cache.get("forecast:test")).resolves.toMatchObject({ value: { score: 88 } });
    vi.advanceTimersByTime(30_001);
    await expect(cache.get("forecast:test")).resolves.toBeNull();
    await expect(cache.get("forecast:test", true)).resolves.toMatchObject({ value: { score: 88 } });
  });
});
