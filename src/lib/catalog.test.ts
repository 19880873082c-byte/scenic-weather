import { describe, expect, it } from "vitest";
import { inferScenicType, searchCatalog } from "./catalog";
import { buildSearchQueries } from "./adapters/places";

describe("place catalog", () => {
  it("finds known scenic areas and preserves location", () => {
    const results = searchCatalog("黄山");
    expect(results[0]).toMatchObject({ name: "黄山风景区", province: "安徽省", city: "黄山市", type: "mountain" });
  });
  it.each([["鼓浪屿", "coast"], ["乌镇", "ancient-town"], ["呼伦贝尔草原", "grassland"], ["长白山", "snow"]])("infers %s", (name, expected) => expect(inferScenicType(name)).toBe(expected));
  it("creates safe fallback queries for long scenic names", () => {
    expect(buildSearchQueries("神农架国家级自然保护区")).toEqual(["神农架国家级自然保护区", "神农架", "shennongjia"]);
    expect(buildSearchQueries("西溪国家湿地公园5A级景区")).toContain("西溪国家湿地公园");
  });
});
