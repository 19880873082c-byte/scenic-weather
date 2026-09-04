import { getCache } from "../cache";
import { fetchJson } from "../http";
import { getProviderStatus, getQWeatherRuntimeConfig } from "../provider-config";
import { rankDaysForViewing, scoreDay } from "../scoring";
import type { CurrentWeather, DayWeather, ForecastResponse, HourWeather, Place } from "../types";
import { addMinutes, average, round } from "../utils";
import { applyOfficialAlerts, getQWeatherBundle, type QWeatherBundle } from "./qweather";

interface OpenMeteoForecast {
  timezone: string;
  current: Record<string, number | string>;
  hourly: Record<string, (number | string)[]>;
  daily: Record<string, (number | string)[]>;
}
interface OpenMeteoAir { hourly?: Record<string, (number | string | null)[]> }

const WEATHER_PROVIDER = "Open‑Meteo Forecast API";
const AIR_PROVIDER = "Open‑Meteo Air Quality API（最多7天）";

export async function getForecast(place: Place, days = 15): Promise<ForecastResponse> {
  const forecastDays = Math.max(7, Math.min(15, days));
  const status = getProviderStatus();
  const qweather = status.preference === "open-meteo" ? null : getQWeatherRuntimeConfig();
  const cache = getCache();
  const source = qweather ? "qweather" : "open-meteo";
  const key = `forecast:v7:${source}:${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}:${place.type}:${forecastDays}`;
  const cached = await cache.get<ForecastResponse>(key);
  if (cached) return { ...cached.value, cached: true };
  try {
    const result = qweather
      ? await getPreferredForecast(place, forecastDays, qweather)
      : await getOpenMeteoForecast(place, forecastDays, status.preference === "qweather" ? "和风配置不完整，已自动使用 Open‑Meteo。请检查 /api/health。" : undefined);
    const ttlSeconds = result.providerNotice?.includes("暂时不可用") || result.providerNotice?.includes("失败") ? 60 : 1800;
    await cache.set(key, result, ttlSeconds);
    return result;
  } catch (error) {
    const stale = await cache.get<ForecastResponse>(key, true);
    if (stale) return { ...stale.value, cached: true, stale: true };
    throw error;
  }
}

async function getPreferredForecast(place: Place, days: number, config: NonNullable<ReturnType<typeof getQWeatherRuntimeConfig>>): Promise<ForecastResponse> {
  const [openResult, qweatherResult] = await Promise.allSettled([
    getOpenMeteoForecast(place, days),
    getQWeatherBundle(place, days, config),
  ]);
  if (qweatherResult.status === "fulfilled" && openResult.status === "fulfilled") {
    return mergeForecasts(openResult.value, qweatherResult.value, days);
  }
  if (qweatherResult.status === "fulfilled") {
    return forecastFromQWeather(place, qweatherResult.value, days, days > 10 ? "Open‑Meteo 补充预报暂不可用，本次仅返回和风前 10 天数据。" : undefined);
  }
  if (openResult.status === "fulfilled") {
    return {
      ...openResult.value,
      providers: { ...openResult.value.providers, weather: `${WEATHER_PROVIDER}（和风失败后自动降级）` },
      providerNotice: "和风天气暂时不可用，已自动使用 Open‑Meteo 真实预报。",
    };
  }
  throw qweatherResult.reason instanceof Error ? qweatherResult.reason : openResult.reason;
}

export function mergeForecasts(base: ForecastResponse, qweather: QWeatherBundle, requestedDays: number): ForecastResponse {
  const qHours = new Map(qweather.hourly.map((hour) => [hour.time.slice(0, 16), hour]));
  const hourly = base.hourly.map((baseHour) => {
    const preferred = qHours.get(baseHour.time.slice(0, 16));
    return preferred ? { ...preferred, aqi: preferred.aqi ?? baseHour.aqi, pm25: preferred.pm25 ?? baseHour.pm25 } : baseHour;
  });
  const qDays = new Map(qweather.days.map((day) => [day.date, day]));
  let days = base.days.map((baseDay) => {
    const preferred = qDays.get(baseDay.date);
    if (!preferred) return baseDay;
    const merged = { ...preferred, aqi: preferred.aqi ?? baseDay.aqi, pm25: preferred.pm25 ?? baseDay.pm25 };
    return { ...merged, ...scoreDay(merged, base.place.type), safetyAdjustment: undefined };
  });
  days = applyOfficialAlerts(days, qweather.officialAlerts);
  return {
    ...base,
    current: qweather.current,
    days,
    hourly,
    bestDates: rankDates(days),
    fetchedAt: qweather.fetchedAt,
    providers: {
      weather: requestedDays > 10 ? "和风天气 Weather API v1（前10天）+ Open‑Meteo（第11–15天）" : "和风天气 Weather API v1",
      airQuality: qweather.airQualityAvailable ? "和风天气 Air Quality API v1 + Open‑Meteo 远期补充" : AIR_PROVIDER,
      location: base.providers.location,
      alerts: "和风天气官方预警 API",
    },
    officialAlerts: qweather.officialAlerts,
    attributions: [...new Set([...(base.attributions ?? []), ...qweather.attributions])],
    providerNotice: requestedDays > 10 ? "和风坐标预报当前最多 10 天，第 11–15 天使用 Open‑Meteo 补充；远期置信度会继续下降。" : undefined,
    cached: false,
    stale: undefined,
  };
}

function forecastFromQWeather(place: Place, qweather: QWeatherBundle, requestedDays: number, notice?: string): ForecastResponse {
  const days = applyOfficialAlerts(qweather.days, qweather.officialAlerts);
  return {
    place,
    current: qweather.current,
    days,
    hourly: qweather.hourly,
    bestDates: rankDates(days),
    fetchedAt: qweather.fetchedAt,
    timezone: "Asia/Shanghai",
    providers: {
      weather: "和风天气 Weather API v1",
      airQuality: qweather.airQualityAvailable ? "和风天气 Air Quality API v1（24小时/3天）" : "空气质量数据暂不可用",
      location: locationProviderLabel(place),
      alerts: "和风天气官方预警 API",
    },
    officialAlerts: qweather.officialAlerts,
    attributions: qweather.attributions,
    providerNotice: notice ?? (requestedDays > 10 ? "和风坐标预报当前最多返回 10 天。" : undefined),
    cached: false,
  };
}

async function getOpenMeteoForecast(place: Place, forecastDays: number, providerNotice?: string): Promise<ForecastResponse> {
  const [weather, air] = await Promise.all([
    fetchJson<OpenMeteoForecast>(weatherUrl(place, forecastDays), {}, { timeoutMs: 10_000, retries: 2 }),
    fetchJson<OpenMeteoAir>(airUrl(place), {}, { timeoutMs: 8_000, retries: 1 }).catch(() => ({ hourly: undefined })),
  ]);
  return { ...normalizeForecast(place, weather, air), providerNotice };
}

function weatherUrl(place: Place, days: number): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(place.latitude)); url.searchParams.set("longitude", String(place.longitude));
  url.searchParams.set("timezone", "Asia/Shanghai"); url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m");
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,uv_index");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max");
  return url.toString();
}

function airUrl(place: Place): string {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", String(place.latitude)); url.searchParams.set("longitude", String(place.longitude));
  url.searchParams.set("timezone", "Asia/Shanghai"); url.searchParams.set("forecast_days", "7"); url.searchParams.set("hourly", "pm2_5,us_aqi");
  return url.toString();
}

function normalizeForecast(place: Place, weather: OpenMeteoForecast, air: OpenMeteoAir): ForecastResponse {
  const h = weather.hourly;
  const airByTime = new Map<string, { pm25: number | null; aqi: number | null }>();
  ((air.hourly?.time ?? []) as string[]).forEach((time, index) => airByTime.set(time, {
    pm25: numericOrNull(air.hourly?.pm2_5?.[index]), aqi: numericOrNull(air.hourly?.us_aqi?.[index]),
  }));
  const hourly: HourWeather[] = (h.time as string[]).map((time, index) => ({
    time, temperature: num(h.temperature_2m[index]), apparentTemperature: num(h.apparent_temperature[index]),
    precipitationProbability: num(h.precipitation_probability[index]), precipitation: num(h.precipitation[index]), weatherCode: num(h.weather_code[index]),
    cloudCover: num(h.cloud_cover[index]), humidity: num(h.relative_humidity_2m[index]), windSpeed: num(h.wind_speed_10m[index]), windGusts: num(h.wind_gusts_10m[index]), visibility: num(h.visibility[index]) / 1000, uvIndex: num(h.uv_index[index]),
    pm25: airByTime.get(time)?.pm25 ?? null, aqi: airByTime.get(time)?.aqi ?? null,
  }));
  const d = weather.daily;
  const days: DayWeather[] = (d.time as string[]).map((date, index) => {
    const hours = hourly.filter((hour) => hour.time.startsWith(date));
    const sunrise = String(d.sunrise[index]); const sunset = String(d.sunset[index]);
    const raw = {
      date, weatherCode: num(d.weather_code[index]), temperatureMax: num(d.temperature_2m_max[index]), temperatureMin: num(d.temperature_2m_min[index]), apparentMax: num(d.apparent_temperature_max[index]), apparentMin: num(d.apparent_temperature_min[index]),
      precipitationSum: num(d.precipitation_sum[index]), precipitationProbability: num(d.precipitation_probability_max[index]), cloudCover: average(hours.map((hour) => hour.cloudCover)), humidity: average(hours.map((hour) => hour.humidity)), windSpeed: num(d.wind_speed_10m_max[index]), windGusts: num(d.wind_gusts_10m_max[index]), visibility: average(hours.map((hour) => hour.visibility)), uvIndex: num(d.uv_index_max[index]), pm25: nullableAverage(hours.map((hour) => hour.pm25)), aqi: nullableAverage(hours.map((hour) => hour.aqi)), sunrise, sunset,
      goldenMorning: `${sunrise.slice(11, 16)}–${addMinutes(sunrise, 60)}`, goldenEvening: `${addMinutes(sunset, -60)}–${sunset.slice(11, 16)}`, daylightDuration: num(d.daylight_duration[index]),
    };
    return { ...raw, ...scoreDay(raw, place.type) };
  });
  const currentRaw = weather.current;
  const currentTime = String(currentRaw.time);
  const nearestHour = hourly.find((hour) => hour.time === currentTime.slice(0, 13) + ":00") ?? hourly[0];
  const current: CurrentWeather = {
    time: currentTime, temperature: num(currentRaw.temperature_2m), apparentTemperature: num(currentRaw.apparent_temperature), humidity: num(currentRaw.relative_humidity_2m), precipitation: num(currentRaw.precipitation), weatherCode: num(currentRaw.weather_code), cloudCover: num(currentRaw.cloud_cover), windSpeed: num(currentRaw.wind_speed_10m), windGusts: num(currentRaw.wind_gusts_10m), windDirection: num(currentRaw.wind_direction_10m), visibility: nearestHour?.visibility ?? 0,
  };
  const fetchedAt = new Date().toISOString();
  const bestDates = rankDates(days);
  return { place, current, days, hourly, bestDates, fetchedAt, timezone: weather.timezone, providers: { weather: WEATHER_PROVIDER, airQuality: AIR_PROVIDER, location: locationProviderLabel(place) }, attributions: ["https://open-meteo.com/"], cached: false };
}

function rankDates(days: DayWeather[]): string[] {
  return rankDaysForViewing(days).slice(0, 3).map((day) => day.date);
}

function locationProviderLabel(place: Place): string {
  if (place.source === "amap") return "高德地图 Web 服务";
  if (place.source === "registry" || place.source === "catalog") return "专业景区数据库";
  if (place.source === "coordinates") return "用户输入坐标";
  if (place.source === "geolocation") return "设备定位坐标";
  return "Open‑Meteo Geocoding";
}

function num(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function numericOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function nullableAverage(values: (number | null)[]): number | null { const clean = values.filter((value): value is number => value !== null); return clean.length ? round(average(clean), 1) : null; }
