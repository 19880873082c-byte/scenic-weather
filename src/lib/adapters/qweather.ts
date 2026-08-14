import { fetchJson } from "../http";
import { scoreDay } from "../scoring";
import type { CurrentWeather, DayWeather, HourWeather, OfficialWeatherAlert, Place } from "../types";
import { addMinutes, average, clamp, round } from "../utils";
import type { QWeatherRuntimeConfig } from "../provider-config";

interface Metadata { attributions?: string[] }
interface Measurement { value?: number; unit?: string }
interface Condition { code?: string; text?: string }
interface Wind {
  direction?: { degree?: number; compass?: string };
  speed?: Measurement;
  scale?: number;
}
interface Precipitation {
  amount?: Measurement;
  intensity?: Measurement;
  probability?: number;
  type?: string;
}
interface WeatherPeriod {
  forecastStartTime?: string;
  forecastEndTime?: string;
  condition?: Condition;
  temperatureMax?: Measurement;
  temperatureMin?: Measurement;
  humidity?: number;
  wind?: Wind;
  windGustMax?: Measurement;
  precipitation?: Precipitation;
  cloudCover?: number;
}
interface QWeatherCurrentResponse {
  metadata?: Metadata;
  condition?: Condition;
  temperature?: Measurement;
  feelsLike?: Measurement;
  humidity?: number;
  wind?: Wind;
  windGust?: Measurement;
  precipitation?: Precipitation;
  visibility?: Measurement;
  cloudCover?: number;
  uvIndex?: number;
}
interface QWeatherHour extends WeatherPeriod {
  forecastTime?: string;
  temperature?: Measurement;
  feelsLike?: Measurement;
  windGust?: Measurement;
  visibility?: Measurement;
  uvIndex?: number;
}
interface QWeatherHourlyResponse { metadata?: Metadata; hours?: QWeatherHour[] }
interface QWeatherDay {
  forecastStartTime?: string;
  forecastEndTime?: string;
  astro?: { sunrise?: string; sunset?: string };
  temperatureMax?: Measurement;
  temperatureMin?: Measurement;
  temperatureAvg?: Measurement;
  uvIndexMax?: number;
  daytime?: WeatherPeriod;
  nighttime?: WeatherPeriod;
}
interface QWeatherDailyResponse { metadata?: Metadata; days?: QWeatherDay[] }
interface AirIndex { code?: string; aqi?: number }
interface Pollutant { code?: string; concentration?: Measurement }
interface QWeatherAirPeriod {
  forecastTime?: string;
  forecastStartTime?: string;
  indexes?: AirIndex[];
  pollutants?: Pollutant[];
}
interface QWeatherAirHourlyResponse { metadata?: Metadata; hours?: QWeatherAirPeriod[] }
interface QWeatherAirDailyResponse { metadata?: Metadata; days?: QWeatherAirPeriod[] }
interface QWeatherAlertResponse {
  metadata?: Metadata & { zeroResult?: boolean };
  alerts?: Array<{
    id?: string;
    senderName?: string;
    eventType?: { name?: string; code?: string };
    urgency?: string | null;
    severity?: string | null;
    color?: { code?: string };
    effectiveTime?: string | null;
    onsetTime?: string | null;
    expireTime?: string | null;
    headline?: string;
    description?: string;
    instruction?: string | null;
  }>;
}

export interface QWeatherBundle {
  current: CurrentWeather;
  days: DayWeather[];
  hourly: HourWeather[];
  officialAlerts: OfficialWeatherAlert[];
  attributions: string[];
  airQualityAvailable: boolean;
  fetchedAt: string;
}

export async function getQWeatherBundle(place: Place, requestedDays: number, config: QWeatherRuntimeConfig): Promise<QWeatherBundle> {
  const days = Math.min(10, Math.max(7, requestedDays));
  const coordinates = `${place.latitude.toFixed(2)}/${place.longitude.toFixed(2)}`;
  const headers = config.authHeader;
  const common = { localTime: "true", lang: "zh" };
  const essential = await Promise.all([
    fetchJson<QWeatherCurrentResponse>(buildUrl(config.host, `/weather/v1/current/${coordinates}`, common), { headers }, { timeoutMs: 9_000, retries: 1 }),
    fetchJson<QWeatherDailyResponse>(buildUrl(config.host, `/weather/v1/daily/${coordinates}`, { ...common, days: String(days) }), { headers }, { timeoutMs: 10_000, retries: 1 }),
    fetchJson<QWeatherHourlyResponse>(buildUrl(config.host, `/weather/v1/hourly/${coordinates}`, { ...common, hours: String(days * 24) }), { headers }, { timeoutMs: 10_000, retries: 1 }),
  ]);
  const [airHourly, airDaily, alerts] = await Promise.all([
    optionalFetch<QWeatherAirHourlyResponse>(buildUrl(config.host, `/airquality/v1/hourly/${coordinates}`, common), headers),
    optionalFetch<QWeatherAirDailyResponse>(buildUrl(config.host, `/airquality/v1/daily/${coordinates}`, common), headers),
    optionalFetch<QWeatherAlertResponse>(buildUrl(config.host, `/weatheralert/v1/current/${coordinates}`, common), headers),
  ]);
  return normalizeQWeatherBundle(place, essential[0], essential[1], essential[2], airHourly, airDaily, alerts);
}

async function optionalFetch<T>(url: string, headers: HeadersInit): Promise<T | undefined> {
  return fetchJson<T>(url, { headers }, { timeoutMs: 7_000, retries: 1 }).catch(() => undefined);
}

function buildUrl(host: string, path: string, parameters: Record<string, string>): string {
  const url = new URL(path, host);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function normalizeQWeatherBundle(
  place: Place,
  currentResponse: QWeatherCurrentResponse,
  dailyResponse: QWeatherDailyResponse,
  hourlyResponse: QWeatherHourlyResponse,
  airHourlyResponse?: QWeatherAirHourlyResponse,
  airDailyResponse?: QWeatherAirDailyResponse,
  alertResponse?: QWeatherAlertResponse,
  fetchedAt = new Date().toISOString(),
): QWeatherBundle {
  const airByHour = new Map<string, { aqi: number | null; pm25: number | null }>();
  for (const item of airHourlyResponse?.hours ?? []) {
    if (!item.forecastTime) continue;
    airByHour.set(toChinaLocalIso(item.forecastTime), normalizeAir(item));
  }
  const airByDay = new Map<string, { aqi: number | null; pm25: number | null }>();
  for (const item of airDailyResponse?.days ?? []) {
    if (!item.forecastStartTime) continue;
    airByDay.set(toChinaLocalIso(item.forecastStartTime).slice(0, 10), normalizeAir(item));
  }

  const hourly: HourWeather[] = (hourlyResponse.hours ?? []).flatMap((hour) => {
    if (!hour.forecastTime) return [];
    const time = toChinaLocalIso(hour.forecastTime);
    const air = airByHour.get(time);
    return [{
      time,
      temperature: measurement(hour.temperature),
      apparentTemperature: measurement(hour.feelsLike, measurement(hour.temperature)),
      precipitationProbability: percent(hour.precipitation?.probability),
      precipitation: measurement(hour.precipitation?.amount),
      weatherCode: qWeatherCodeToWmo(hour.condition?.code),
      cloudCover: percent(hour.cloudCover),
      humidity: percent(hour.humidity),
      windSpeed: speedKmh(hour.wind?.speed),
      windGusts: speedKmh(hour.windGust),
      visibility: visibilityKm(hour.visibility),
      uvIndex: finite(hour.uvIndex),
      pm25: air?.pm25 ?? null,
      aqi: air?.aqi ?? null,
    }];
  });

  const days: DayWeather[] = (dailyResponse.days ?? []).flatMap((day) => {
    if (!day.forecastStartTime) return [];
    const date = toChinaLocalIso(day.forecastStartTime).slice(0, 10);
    const hours = hourly.filter((hour) => hour.time.startsWith(date));
    const sunrise = normalizeSunTime(day.astro?.sunrise, date, "06:00");
    const sunset = normalizeSunTime(day.astro?.sunset, date, "18:00");
    const dailyAir = airByDay.get(date);
    const hourlyAqi = nullableAverage(hours.map((hour) => hour.aqi));
    const hourlyPm25 = nullableAverage(hours.map((hour) => hour.pm25));
    const temperatureMax = measurement(day.temperatureMax, max(hours.map((hour) => hour.temperature)));
    const temperatureMin = measurement(day.temperatureMin, min(hours.map((hour) => hour.temperature)));
    const raw = {
      date,
      weatherCode: qWeatherCodeToWmo(day.daytime?.condition?.code ?? day.nighttime?.condition?.code),
      temperatureMax,
      temperatureMin,
      apparentMax: max(hours.map((hour) => hour.apparentTemperature), temperatureMax),
      apparentMin: min(hours.map((hour) => hour.apparentTemperature), temperatureMin),
      precipitationSum: measurement(day.daytime?.precipitation?.amount) + measurement(day.nighttime?.precipitation?.amount),
      precipitationProbability: Math.max(percent(day.daytime?.precipitation?.probability), percent(day.nighttime?.precipitation?.probability)),
      cloudCover: average([percent(day.daytime?.cloudCover), percent(day.nighttime?.cloudCover)]),
      humidity: average([percent(day.daytime?.humidity), percent(day.nighttime?.humidity)]),
      windSpeed: Math.max(speedKmh(day.daytime?.wind?.speed), speedKmh(day.nighttime?.wind?.speed)),
      windGusts: Math.max(speedKmh(day.daytime?.windGustMax), speedKmh(day.nighttime?.windGustMax)),
      visibility: average(hours.map((hour) => hour.visibility)) || 10,
      uvIndex: finite(day.uvIndexMax),
      pm25: dailyAir?.pm25 ?? hourlyPm25,
      aqi: dailyAir?.aqi ?? hourlyAqi,
      sunrise,
      sunset,
      goldenMorning: `${sunrise.slice(11, 16)}–${addMinutes(sunrise, 60)}`,
      goldenEvening: `${addMinutes(sunset, -60)}–${sunset.slice(11, 16)}`,
      daylightDuration: daylightSeconds(sunrise, sunset),
    };
    return [{ ...raw, ...scoreDay(raw, place.type) }];
  });

  const officialAlerts = normalizeAlerts(alertResponse);
  const current = normalizeCurrent(currentResponse, hourly, fetchedAt);
  const attributions = collectAttributions(currentResponse, dailyResponse, hourlyResponse, airHourlyResponse, airDailyResponse, alertResponse);
  return {
    current,
    days,
    hourly,
    officialAlerts,
    attributions,
    airQualityAvailable: Boolean(airHourlyResponse || airDailyResponse),
    fetchedAt,
  };
}

function normalizeCurrent(response: QWeatherCurrentResponse, hourly: HourWeather[], fetchedAt: string): CurrentWeather {
  const nearest = hourly[0];
  return {
    time: nearest?.time ?? toChinaLocalIso(fetchedAt),
    temperature: measurement(response.temperature, nearest?.temperature ?? 0),
    apparentTemperature: measurement(response.feelsLike, nearest?.apparentTemperature ?? 0),
    humidity: percent(response.humidity),
    precipitation: measurement(response.precipitation?.amount),
    weatherCode: qWeatherCodeToWmo(response.condition?.code),
    cloudCover: percent(response.cloudCover),
    windSpeed: speedKmh(response.wind?.speed),
    windGusts: speedKmh(response.windGust),
    windDirection: finite(response.wind?.direction?.degree),
    visibility: visibilityKm(response.visibility),
  };
}

function normalizeAir(item: QWeatherAirPeriod): { aqi: number | null; pm25: number | null } {
  const localIndex = item.indexes?.find((index) => index.code?.startsWith("cn-mee"));
  const comparableIndex = localIndex ?? item.indexes?.find((index) => index.code === "us-epa");
  const pollutant = item.pollutants?.find((entry) => entry.code === "pm2p5");
  return {
    aqi: finiteOrNull(comparableIndex?.aqi),
    pm25: finiteOrNull(pollutant?.concentration?.value),
  };
}

export function normalizeAlerts(response?: QWeatherAlertResponse): OfficialWeatherAlert[] {
  return (response?.alerts ?? []).flatMap((alert, index) => {
    const headline = alert.headline?.trim() || alert.eventType?.name?.trim();
    if (!headline) return [];
    return [{
      id: alert.id || `qweather-alert-${index}`,
      senderName: alert.senderName?.trim() || "气象主管机构",
      event: alert.eventType?.name?.trim() || "天气预警",
      severity: normalizeSeverity(alert.severity),
      urgency: alert.urgency?.trim() || "unknown",
      headline,
      description: alert.description?.trim() || "请关注当地气象部门和景区最新公告。",
      instruction: alert.instruction?.trim() || undefined,
      effectiveTime: alert.effectiveTime || alert.onsetTime || undefined,
      expireTime: alert.expireTime || undefined,
      color: alert.color?.code || undefined,
    }];
  });
}

export function applyOfficialAlerts(days: DayWeather[], alerts: OfficialWeatherAlert[]): DayWeather[] {
  return days.map((day, index) => {
    const relevant = alerts.filter((alert) => alertAppliesToDate(alert, day.date, index));
    if (!relevant.length) return day;
    const penalty = Math.max(...relevant.map((alert) => severityPenalty(alert.severity)));
    const officialWarnings = relevant.map((alert) => `官方预警：${alert.headline}`);
    return {
      ...day,
      score: round(clamp(day.score - penalty, 0, 100)),
      safetyAdjustment: -penalty,
      warnings: [...new Set([...officialWarnings, ...day.warnings])],
      concerns: [...new Set([`官方预警安全扣分 ${penalty} 分；请以发布机构和景区公告为准`, ...day.concerns])],
    };
  });
}

function alertAppliesToDate(alert: OfficialWeatherAlert, date: string, index: number): boolean {
  const start = alert.effectiveTime ? toChinaLocalIso(alert.effectiveTime).slice(0, 10) : null;
  const end = alert.expireTime ? toChinaLocalIso(alert.expireTime).slice(0, 10) : null;
  if (!start && !end) return index === 0;
  return (!start || date >= start) && (!end || date <= end);
}

function severityPenalty(severity: OfficialWeatherAlert["severity"]): number {
  return severity === "extreme" ? 40 : severity === "severe" ? 30 : severity === "moderate" ? 18 : severity === "minor" ? 8 : 10;
}

function normalizeSeverity(value?: string | null): OfficialWeatherAlert["severity"] {
  return value === "extreme" || value === "severe" || value === "moderate" || value === "minor" ? value : "unknown";
}

export function qWeatherCodeToWmo(value?: string): number {
  const code = Number(value);
  if (code === 100 || code === 150 || code === 900 || code === 901) return 0;
  if (code === 102 || code === 152) return 1;
  if (code === 101 || code === 103 || code === 151 || code === 153) return 2;
  if (code === 104 || code === 999) return 3;
  if ([500, 501, 502, 503, 504, 507, 508, 509, 510, 511, 512, 513, 514, 515].includes(code)) return 45;
  if (code === 309) return 51;
  if (code === 305 || code === 314) return 61;
  if (code === 306 || code === 315 || code === 399) return 63;
  if ([307, 308, 310, 311, 312, 316, 317, 318].includes(code)) return 65;
  if (code === 313) return 66;
  if (code === 400 || code === 408) return 71;
  if (code === 401 || code === 409 || code === 499) return 73;
  if (code === 402 || code === 403 || code === 410) return 75;
  if ([404, 405, 406, 456].includes(code)) return 67;
  if (code === 407 || code === 457) return 85;
  if (code === 300 || code === 350) return 80;
  if (code === 301 || code === 351) return 82;
  if (code === 302) return 95;
  if (code === 303) return 96;
  if (code === 304) return 99;
  return 3;
}

function collectAttributions(...responses: Array<{ metadata?: Metadata } | undefined>): string[] {
  return [...new Set(["https://www.qweather.com", ...responses.flatMap((response) => response?.metadata?.attributions ?? [])])];
}

function measurement(value: Measurement | undefined, fallback = 0): number {
  return typeof value?.value === "number" && Number.isFinite(value.value) ? value.value : fallback;
}

function finite(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function finiteOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function percent(value: unknown): number { const number = finite(value); return number >= 0 && number <= 1 ? number * 100 : number; }
function speedKmh(value?: Measurement): number { const speed = measurement(value); return value?.unit?.toLowerCase().includes("m/s") ? speed * 3.6 : speed; }
function visibilityKm(value?: Measurement): number { const distance = measurement(value); return value?.unit?.toLowerCase() === "km" ? distance : distance / 1000; }
function nullableAverage(values: (number | null)[]): number | null { const clean = values.filter((value): value is number => value !== null); return clean.length ? round(average(clean), 1) : null; }
function max(values: number[], fallback = 0): number { const clean = values.filter(Number.isFinite); return clean.length ? Math.max(...clean) : fallback; }
function min(values: number[], fallback = 0): number { const clean = values.filter(Number.isFinite); return clean.length ? Math.min(...clean) : fallback; }

function normalizeSunTime(value: string | undefined, date: string, fallback: string): string {
  return value ? toChinaLocalIso(value) : `${date}T${fallback}`;
}

function daylightSeconds(sunrise: string, sunset: string): number {
  const start = new Date(`${sunrise}:00+08:00`).getTime();
  const end = new Date(`${sunset}:00+08:00`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 1000) : 0;
}

function toChinaLocalIso(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
