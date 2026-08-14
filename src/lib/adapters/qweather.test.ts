import { describe, expect, it } from "vitest";
import type { Place } from "../types";
import { applyOfficialAlerts, normalizeQWeatherBundle, qWeatherCodeToWmo } from "./qweather";

const place: Place = {
  id: "test:huangshan",
  name: "黄山",
  province: "安徽省",
  city: "黄山市",
  address: "黄山风景区",
  latitude: 30.13,
  longitude: 118.17,
  type: "mountain",
  source: "registry",
};

describe("QWeather adapter", () => {
  it("maps QWeather condition families into the app weather codes", () => {
    expect(qWeatherCodeToWmo("100")).toBe(0);
    expect(qWeatherCodeToWmo("305")).toBe(61);
    expect(qWeatherCodeToWmo("302")).toBe(95);
    expect(qWeatherCodeToWmo("403")).toBe(75);
    expect(qWeatherCodeToWmo("508")).toBe(45);
    expect(qWeatherCodeToWmo("new-code")).toBe(3);
  });

  it("normalizes metric point forecasts, air quality and official alerts", () => {
    const result = normalizeQWeatherBundle(
      place,
      {
        metadata: { attributions: ["https://developer.qweather.com/attribution.html"] },
        condition: { code: "101", text: "多云" },
        temperature: { value: 22, unit: "°C" },
        feelsLike: { value: 21, unit: "°C" },
        humidity: 0.6,
        wind: { direction: { degree: 120 }, speed: { value: 5, unit: "m/s" } },
        windGust: { value: 8, unit: "m/s" },
        precipitation: { amount: { value: 0, unit: "mm" } },
        visibility: { value: 20_000, unit: "m" },
        cloudCover: 0.4,
      },
      {
        days: [{
          forecastStartTime: "2026-08-15T00:00+08:00",
          astro: { sunrise: "2026-08-15T05:30+08:00", sunset: "2026-08-15T18:50+08:00" },
          temperatureMax: { value: 25, unit: "°C" },
          temperatureMin: { value: 16, unit: "°C" },
          uvIndexMax: 7,
          daytime: { condition: { code: "302" }, humidity: 0.58, cloudCover: 0.45, wind: { speed: { value: 4, unit: "m/s" } }, windGustMax: { value: 9, unit: "m/s" }, precipitation: { amount: { value: 2, unit: "mm" }, probability: 0.7 } },
          nighttime: { condition: { code: "101" }, humidity: 0.72, cloudCover: 0.6, wind: { speed: { value: 2, unit: "m/s" } }, windGustMax: { value: 5, unit: "m/s" }, precipitation: { amount: { value: 0, unit: "mm" }, probability: 0.1 } },
        }],
      },
      {
        hours: [
          { forecastTime: "2026-08-15T08:00+08:00", condition: { code: "101" }, temperature: { value: 18, unit: "°C" }, feelsLike: { value: 17, unit: "°C" }, humidity: 0.65, cloudCover: 0.5, wind: { speed: { value: 3, unit: "m/s" } }, windGust: { value: 6, unit: "m/s" }, precipitation: { amount: { value: 0, unit: "mm" }, probability: 0.2 }, visibility: { value: 18_000, unit: "m" }, uvIndex: 2 },
          { forecastTime: "2026-08-15T09:00+08:00", condition: { code: "302" }, temperature: { value: 20, unit: "°C" }, feelsLike: { value: 19, unit: "°C" }, humidity: 0.6, cloudCover: 0.6, wind: { speed: { value: 4, unit: "m/s" } }, windGust: { value: 8, unit: "m/s" }, precipitation: { amount: { value: 1, unit: "mm" }, probability: 0.6 }, visibility: { value: 12_000, unit: "m" }, uvIndex: 3 },
        ],
      },
      { hours: [{ forecastTime: "2026-08-15T08:00+08:00", indexes: [{ code: "cn-mee-1h", aqi: 42 }], pollutants: [{ code: "pm2p5", concentration: { value: 18, unit: "μg/m³" } }] }] },
      { days: [{ forecastStartTime: "2026-08-15T00:00+08:00", indexes: [{ code: "cn-mee-24h", aqi: 48 }], pollutants: [{ code: "pm2p5", concentration: { value: 20, unit: "μg/m³" } }] }] },
      { alerts: [{ id: "alert-1", senderName: "黄山市气象台", eventType: { name: "雷电" }, severity: "severe", effectiveTime: "2026-08-15T07:00+08:00", expireTime: "2026-08-15T12:00+08:00", headline: "雷电橙色预警", description: "预计景区将出现雷电活动。", instruction: "暂停登高。" }] },
      "2026-08-14T12:00:00+08:00",
    );

    expect(result.current).toMatchObject({ temperature: 22, humidity: 60, windSpeed: 18, visibility: 20, weatherCode: 2 });
    expect(result.hourly[0]).toMatchObject({ time: "2026-08-15T08:00", aqi: 42, pm25: 18, windSpeed: 10.8 });
    expect(result.days[0]).toMatchObject({ date: "2026-08-15", weatherCode: 95, precipitationProbability: 70, aqi: 48, pm25: 20, sunrise: "2026-08-15T05:30", sunset: "2026-08-15T18:50" });
    expect(result.days[0].daylightDuration).toBe(48_000);
    expect(result.officialAlerts[0].headline).toBe("雷电橙色预警");
    expect(result.attributions).toContain("https://developer.qweather.com/attribution.html");

    const adjusted = applyOfficialAlerts(result.days, result.officialAlerts)[0];
    expect(adjusted.safetyAdjustment).toBe(-30);
    expect(adjusted.warnings[0]).toContain("官方预警");
    expect(adjusted.score).toBeLessThan(result.days[0].score);
  });
});
