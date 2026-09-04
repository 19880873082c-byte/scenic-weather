import { describe, expect, it, beforeEach, vi } from "vitest";
import { addHistory, clearStoredClientData, defaultSettings, readFavorites, readHistory, readLatestForecast, readLocal, readSettings, STORE_KEYS, writeLocal } from "./client-store";
import type { Place } from "./types";

const memory = new Map<string, string>();
const place: Place = { id: "a", name: "黄山", province: "安徽", city: "黄山", address: "黄山区", latitude: 30, longitude: 118, type: "mountain", source: "catalog" };

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
});

describe("client cache", () => {
  it("round trips values", () => { writeLocal("test", { ok: true }); expect(readLocal("test", null)).toEqual({ ok: true }); });
  it("deduplicates search history", () => {
    addHistory(place); addHistory(place);
    expect(readLocal(STORE_KEYS.history, [])).toHaveLength(1);
  });
  it("returns fallback for malformed cache", () => { memory.set("bad", "{"); expect(readLocal("bad", [1])).toEqual([1]); });
  it("sanitizes malformed persisted application state", () => {
    writeLocal(STORE_KEYS.favorites, [place, { id: "invalid" }]);
    writeLocal(STORE_KEYS.history, [{ place, viewedAt: "2026-08-14T10:00:00Z" }, { place: null, viewedAt: "never" }]);
    writeLocal(STORE_KEYS.settings, { forecastDays: 99, reminders: "yes", compactCharts: true });
    writeLocal(STORE_KEYS.latest, { place: { id: "invalid" }, days: [] });
    expect(readFavorites()).toEqual([place]);
    expect(readHistory()).toHaveLength(1);
    expect(readSettings()).toEqual({ ...defaultSettings, compactCharts: true });
    expect(readLatestForecast()).toBeNull();
  });
  it("clears every application-owned key", () => {
    Object.values(STORE_KEYS).forEach((key) => writeLocal(key, "value"));
    clearStoredClientData();
    expect(Object.values(STORE_KEYS).every((key) => !memory.has(key))).toBe(true);
  });
});
