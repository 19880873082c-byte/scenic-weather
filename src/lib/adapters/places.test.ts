import { describe, expect, it } from "vitest";
import { parseCoordinatePlace, searchPlaces } from "./places";

describe("coordinate place fallback", () => {
  it("accepts a labeled latitude-longitude pair and infers scenic type", () => {
    const place = parseCoordinatePlace("梅里雪山 28.4365, 98.7071");

    expect(place).toMatchObject({
      name: "梅里雪山",
      latitude: 28.4365,
      longitude: 98.7071,
      type: "mountain",
      source: "coordinates",
      quality: "user",
      confidence: 100,
      coordinatePrecision: "point",
    });
  });

  it("accepts longitude-latitude order and normalizes it", () => {
    const place = parseCoordinatePlace("118.1665，30.1339");

    expect(place?.latitude).toBe(30.1339);
    expect(place?.longitude).toBe(118.1665);
    expect(place?.name).toBe("自定义坐标");
  });

  it("rejects coordinates outside the China service boundary", () => {
    expect(parseCoordinatePlace("东京 35.6762,139.6503")).toBeNull();
    expect(parseCoordinatePlace("随便两个数字 12,34")).toBeNull();
  });

  it("returns a coordinate result without calling a geocoding provider", async () => {
    const result = await searchPlaces("海边机位 24.4500,118.0800");

    expect(result.provider).toBe("用户输入坐标");
    expect(result.cached).toBe(false);
    expect(result.places).toHaveLength(1);
    expect(result.places[0].name).toBe("海边机位");
  });
});
