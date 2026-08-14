import { inferScenicType } from "../catalog";
import { getCache } from "../cache";
import { fetchJson } from "../http";
import type { Place } from "../types";
import { pinyin } from "pinyin-pro";
import { getScenicRegistry } from "../db/registry";

interface PlaceAdapter { name: string; persistentCache: boolean; search(query: string): Promise<Place[]> }

interface OpenMeteoGeocoding {
  results?: Array<{
    id: number; name: string; latitude: number; longitude: number; elevation?: number;
    country?: string; admin1?: string; admin2?: string; admin3?: string; feature_code?: string;
  }>;
}

class OpenMeteoPlaceAdapter implements PlaceAdapter {
  name = "Open‑Meteo Geocoding";
  persistentCache = true;
  async search(query: string): Promise<Place[]> {
    const searches = await Promise.allSettled(buildSearchQueries(query).map((candidate) => this.searchOne(candidate, query)));
    return searches.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  }

  private async searchOne(candidate: string, originalQuery: string): Promise<Place[]> {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", candidate);
    url.searchParams.set("count", "12");
    url.searchParams.set("language", "zh");
    url.searchParams.set("countryCode", "CN");
    const data = await fetchJson<OpenMeteoGeocoding>(url.toString(), {}, { timeoutMs: 4500, retries: 0 });
    return (data.results ?? []).map((item) => ({
      id: `open-meteo:${item.id}`,
      name: item.name,
      province: item.admin1 ?? "中国",
      city: item.admin2 ?? item.admin3 ?? item.admin1 ?? "位置待确认",
      address: [item.admin1, item.admin2, item.admin3].filter(Boolean).join(" · ") || "中国",
      latitude: item.latitude,
      longitude: item.longitude,
      elevation: item.elevation,
      type: inferScenicType(`${originalQuery}${item.name}`),
      source: "open-meteo",
      matchNote: candidate === originalQuery ? undefined : `按“${candidate}”匹配到行政区参考位置`,
      quality: candidate === originalQuery ? "provider" : "approximate",
      confidence: candidate === originalQuery ? 65 : 42,
      coordinatePrecision: candidate === originalQuery ? "center" : "administrative",
      sourceReference: `open-meteo:${item.id}`,
    }));
  }
}

type AmapText = string | string[];
interface AmapSearch { status: string; info?: string; pois?: Array<{ id: string; name: string; pname: AmapText; cityname: AmapText; adname: AmapText; address: AmapText; location: string; type: string }> }
class AmapPlaceAdapter implements PlaceAdapter {
  name = "高德地图 Web 服务";
  persistentCache = false;
  constructor(private key: string) {}
  async search(query: string): Promise<Place[]> {
    const url = new URL("https://restapi.amap.com/v5/place/text");
    url.searchParams.set("key", this.key); url.searchParams.set("keywords", query); url.searchParams.set("region", "全国"); url.searchParams.set("show_fields", "business"); url.searchParams.set("page_size", "15");
    const data = await fetchJson<AmapSearch>(url.toString(), {}, { timeoutMs: 4500, retries: 0 });
    if (data.status !== "1") throw new Error(data.info || "高德地点搜索失败");
    return (data.pois ?? []).flatMap((poi) => {
      const [longitude, latitude] = poi.location.split(",").map(Number);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{ id: `amap:${poi.id}`, name: poi.name, province: amapText(poi.pname) || "中国", city: amapText(poi.cityname) || amapText(poi.adname) || "位置待确认", address: amapText(poi.address) || amapText(poi.adname) || "地址待确认", latitude, longitude, type: inferScenicType(`${query}${poi.name}${poi.type}`), source: "amap" as const, quality: "provider" as const, confidence: 88, coordinatePrecision: "entrance" as const, sourceReference: `amap:${poi.id}` }];
    });
  }
}

function amapText(value: AmapText | undefined): string {
  return Array.isArray(value) ? value.filter(Boolean).join(" ") : value ?? "";
}

export function buildSearchQueries(query: string): string[] {
  const normalized = query.trim().replace(/[，,。;；]+/g, " ").replace(/\s+/g, " ");
  if (!normalized) return [];
  const withoutGrade = normalized.replace(/(?:国家)?(?:AAAAA|AAAA|5A|4A)级?/gi, "").trim();
  const simplified = withoutGrade.replace(/(?:国家级自然保护区|风景名胜区|国家森林公园|森林公园|旅游度假区|旅游景区|风景区|旅游区|景区|景点)$/u, "").trim();
  const chineseQueries = [...new Set([normalized, withoutGrade, simplified])].filter((value) => value.length >= 2);
  const romanized = simplified && /[\u3400-\u9fff]/u.test(simplified)
    ? pinyin(simplified, { toneType: "none", type: "array" }).join("")
    : "";
  return [...new Set([...chineseQueries, romanized])].filter((value) => value.length >= 2).slice(0, 4);
}

export function getPlaceAdapter(): PlaceAdapter {
  const provider = process.env.PLACE_PROVIDER?.toLowerCase();
  if (process.env.AMAP_API_KEY && provider !== "open-meteo") return new AmapPlaceAdapter(process.env.AMAP_API_KEY);
  return new OpenMeteoPlaceAdapter();
}

export async function searchPlaces(query: string): Promise<{ places: Place[]; provider: string; cached: boolean }> {
  const coordinatePlace = parseCoordinatePlace(query);
  if (coordinatePlace) return { places: [coordinatePlace], provider: "用户输入坐标", cached: false };
  const catalog = await getScenicRegistry().search(query);
  // A curated registry hit is authoritative enough to answer immediately. This keeps common
  // scenic searches useful even when the optional upstream geocoder is slow or unavailable.
  if (catalog.length) return { places: catalog, provider: "景区位置维护库", cached: false };
  const adapter = getPlaceAdapter();
  const key = `places:v5:${adapter.name}:${query.trim().toLowerCase()}`;
  const cache = getCache();
  const found = adapter.persistentCache ? await cache.get<Place[]>(key) : null;
  if (found) return { places: merge(catalog, found.value), provider: adapter.name, cached: true };
  try {
    const remote = await adapter.search(query);
    if (adapter.persistentCache) await cache.set(key, remote, 86_400);
    return { places: merge(catalog, remote), provider: adapter.name, cached: false };
  } catch (error) {
    const stale = adapter.persistentCache ? await cache.get<Place[]>(key, true) : null;
    if (stale) return { places: merge(catalog, stale.value), provider: `${adapter.name}（历史缓存）`, cached: true };
    if (catalog.length) return { places: catalog, provider: "内置景区目录（在线搜索暂不可用）", cached: false };
    throw error;
  }
}

function merge(primary: Place[], secondary: Place[]): Place[] {
  const seen = new Set<string>();
  return [...primary, ...secondary].sort((a, b) => qualityScore(b) - qualityScore(a)).filter((place) => {
    const key = `${place.name}:${place.province}:${place.city}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 15);
}

function qualityScore(place: Place): number {
  const base = { user: 500, verified: 400, curated: 300, provider: 200, approximate: 100 }[place.quality ?? (place.source === "registry" || place.source === "catalog" ? "curated" : "provider")];
  return base + (place.confidence ?? 50);
}

export function parseCoordinatePlace(query: string): Place | null {
  const match = query.trim().match(/(-?\d{1,3}(?:\.\d+)?)[\s,，、/]+(-?\d{1,3}(?:\.\d+)?)/u);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const latLon = inChinaLatitude(first) && inChinaLongitude(second) ? [first, second] : inChinaLongitude(first) && inChinaLatitude(second) ? [second, first] : null;
  if (!latLon) return null;
  const [latitude, longitude] = latLon;
  const label = query.replace(match[0], "").replace(/^[\s,，、:：-]+|[\s,，、:：-]+$/gu, "").slice(0, 60);
  const coordinateText = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  return {
    id: `coordinates:${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    name: label || "自定义坐标",
    province: "中国境内坐标",
    city: "精确位置",
    address: coordinateText,
    latitude,
    longitude,
    type: inferScenicType(label),
    source: "coordinates",
    matchNote: "按用户提供的精确坐标查询",
    quality: "user",
    confidence: 100,
    coordinatePrecision: "point",
    sourceReference: "user-input",
  };
}

function inChinaLatitude(value: number): boolean { return Number.isFinite(value) && value >= 3 && value <= 54; }
function inChinaLongitude(value: number): boolean { return Number.isFinite(value) && value >= 73 && value <= 136; }
