import type { ForecastResponse, Place } from "./types";

export const STORE_KEYS = {
  favorites: "scenic-weather:favorites:v1",
  history: "scenic-weather:history:v1",
  latest: "scenic-weather:latest:v1",
  settings: "scenic-weather:settings:v1",
};

export interface HistoryItem { place: Place; viewedAt: string }
export interface UserSettings { forecastDays: 7 | 10 | 15; reminders: boolean; compactCharts: boolean }

export const defaultSettings: UserSettings = { forecastDays: 15, reminders: true, compactCharts: false };

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

export function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

export function addHistory(place: Place): HistoryItem[] {
  const current = readLocal<HistoryItem[]>(STORE_KEYS.history, []);
  const next = [{ place, viewedAt: new Date().toISOString() }, ...current.filter((item) => item.place.id !== place.id)].slice(0, 20);
  writeLocal(STORE_KEYS.history, next); return next;
}

export function storeLatest(forecast: ForecastResponse) { writeLocal(STORE_KEYS.latest, forecast); }
