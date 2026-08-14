import { describe, expect, it } from "vitest";
import { detectWeatherChanges, getWeights, scoreDay } from "./scoring";
import type { DayWeather, ScenicType } from "./types";

const base: Omit<DayWeather, "score" | "confidence" | "components" | "reasons" | "concerns" | "advice" | "warnings"> = {
  date: "2026-08-14", weatherCode: 1, temperatureMax: 26, temperatureMin: 17, apparentMax: 26, apparentMin: 17,
  precipitationSum: 0.5, precipitationProbability: 15, cloudCover: 30, humidity: 60, windSpeed: 12, windGusts: 22,
  visibility: 24, uvIndex: 5, pm25: 12, aqi: 42, sunrise: "2026-08-14T05:30", sunset: "2026-08-14T18:50",
  goldenMorning: "05:30–06:30", goldenEvening: "17:50–18:50", daylightDuration: 48000,
};

describe("scenic scoring", () => {
  it.each<ScenicType>(["mountain", "coast", "ancient-town", "grassland", "snow"])("scores %s and keeps weights normalized", (type) => {
    const weights = getWeights(type);
    expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(100, 5);
    const result = scoreDay(base, type, new Date("2026-08-12T12:00:00+08:00"));
    expect(result.score).toBeGreaterThanOrEqual(0); expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components).toHaveLength(6); expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("raises mountain clarity and wind weights", () => {
    const mountain = getWeights("mountain"); const general = getWeights("general");
    expect(mountain.clarity).toBeGreaterThan(general.clarity); expect(mountain.wind).toBeGreaterThan(general.wind);
  });

  it("prioritizes extreme weather safety", () => {
    const result = scoreDay({ ...base, weatherCode: 95, precipitationSum: 42, windGusts: 75 }, "mountain", new Date("2026-08-12T12:00:00+08:00"));
    expect(result.warnings.length).toBeGreaterThanOrEqual(3); expect(result.score).toBeLessThan(45);
  });

  it("reduces confidence for distant forecasts", () => {
    const near = scoreDay(base, "general", new Date("2026-08-14T12:00:00+08:00"));
    const far = scoreDay({ ...base, date: "2026-08-28" }, "general", new Date("2026-08-14T12:00:00+08:00"));
    expect(far.confidence).toBeLessThan(near.confidence);
  });

  it("detects cross-day sudden changes", () => {
    const first = { ...base, ...scoreDay(base, "general", new Date("2026-08-12T12:00:00+08:00")) };
    const changedRaw = { ...base, date: "2026-08-15", precipitationProbability: 85, windGusts: 55 };
    const changed = { ...changedRaw, ...scoreDay(changedRaw, "general", new Date("2026-08-12T12:00:00+08:00")) };
    expect(detectWeatherChanges([first, changed]).some((message) => message.includes("降雨概率"))).toBe(true);
  });
});
