import { describe, expect, it, beforeEach, vi } from "vitest";
import { addHistory, readLocal, STORE_KEYS, writeLocal } from "./client-store";
import type { Place } from "./types";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });
});

describe("client cache", () => {
  it("round trips values", () => { writeLocal("test", { ok: true }); expect(readLocal("test", null)).toEqual({ ok: true }); });
  it("deduplicates search history", () => {
    const place: Place = { id: "a", name: "黄山", province: "安徽", city: "黄山", address: "", latitude: 30, longitude: 118, type: "mountain", source: "catalog" };
    addHistory(place); addHistory(place);
    expect(readLocal(STORE_KEYS.history, [])).toHaveLength(1);
  });
  it("returns fallback for malformed cache", () => { memory.set("bad", "{"); expect(readLocal("bad", [1])).toEqual([1]); });
});
