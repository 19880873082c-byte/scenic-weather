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

const scenicTypes = new Set(["mountain", "coast", "ancient-town", "grassland", "desert", "lake-waterfall", "snow", "general"]);
const placeSources = new Set(["registry", "catalog", "open-meteo", "amap", "coordinates", "geolocation"]);

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

export function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

export function removeLocal(key: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
}

export function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<Place>;
  return typeof place.id === "string" && place.id.length > 0
    && typeof place.name === "string" && place.name.length > 0
    && typeof place.province === "string" && typeof place.city === "string" && typeof place.address === "string"
    && typeof place.latitude === "number" && Number.isFinite(place.latitude) && place.latitude >= 3 && place.latitude <= 54
    && typeof place.longitude === "number" && Number.isFinite(place.longitude) && place.longitude >= 73 && place.longitude <= 136
    && typeof place.type === "string" && scenicTypes.has(place.type)
    && typeof place.source === "string" && placeSources.has(place.source);
}

export function readFavorites(): Place[] {
  const value = readLocal<unknown>(STORE_KEYS.favorites, []);
  return Array.isArray(value) ? value.filter(isPlace).slice(0, 100) : [];
}

export function readHistory(): HistoryItem[] {
  const value = readLocal<unknown>(STORE_KEYS.history, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HistoryItem => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<HistoryItem>;
    return isPlace(candidate.place) && typeof candidate.viewedAt === "string" && Number.isFinite(Date.parse(candidate.viewedAt));
  }).slice(0, 20);
}

export function readSettings(): UserSettings {
  const value = readLocal<unknown>(STORE_KEYS.settings, defaultSettings);
  if (!value || typeof value !== "object") return { ...defaultSettings };
  const candidate = value as Partial<UserSettings>;
  return {
    forecastDays: candidate.forecastDays === 7 || candidate.forecastDays === 10 || candidate.forecastDays === 15 ? candidate.forecastDays : defaultSettings.forecastDays,
    reminders: typeof candidate.reminders === "boolean" ? candidate.reminders : defaultSettings.reminders,
    compactCharts: typeof candidate.compactCharts === "boolean" ? candidate.compactCharts : defaultSettings.compactCharts,
  };
}

export function readLatestForecast(): ForecastResponse | null {
  const value = readLocal<unknown>(STORE_KEYS.latest, null);
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ForecastResponse>;
  if (!isPlace(candidate.place) || !candidate.current || !Array.isArray(candidate.days) || !Array.isArray(candidate.hourly) || typeof candidate.fetchedAt !== "string") return null;
  return candidate as ForecastResponse;
}

export function clearStoredClientData(): void {
  Object.values(STORE_KEYS).forEach(removeLocal);
}

export function addHistory(place: Place): HistoryItem[] {
  const current = readHistory();
  const next = [{ place, viewedAt: new Date().toISOString() }, ...current.filter((item) => item.place.id !== place.id)].slice(0, 20);
  writeLocal(STORE_KEYS.history, next); return next;
}

export function storeLatest(forecast: ForecastResponse) { writeLocal(STORE_KEYS.latest, forecast); }
