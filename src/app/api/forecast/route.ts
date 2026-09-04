import { NextResponse } from "next/server";
import { z } from "zod";
import { getForecast } from "@/lib/adapters/weather";
import { checkRateLimit } from "@/lib/http";

const schema = z.object({
  id: z.string().max(120), name: z.string().min(1).max(80), province: z.string().max(40), city: z.string().max(40), address: z.string().max(160),
  latitude: z.coerce.number().min(3).max(54), longitude: z.coerce.number().min(73).max(136), elevation: z.coerce.number().optional(),
  type: z.enum(["mountain", "coast", "ancient-town", "grassland", "desert", "lake-waterfall", "snow", "general"]), source: z.enum(["registry", "catalog", "open-meteo", "amap", "coordinates", "geolocation"]),
  matchNote: z.string().max(160).optional(), quality: z.enum(["verified", "curated", "provider", "approximate", "user"]).optional(), confidence: z.coerce.number().min(0).max(100).optional(), coordinatePrecision: z.enum(["entrance", "center", "administrative", "point"]).optional(), sourceReference: z.string().max(160).optional(), days: z.coerce.number().int().min(7).max(15).default(15),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return json({ error: "景区位置参数无效", details: parsed.error.flatten() }, 400);
  const client = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!checkRateLimit(`forecast:${client}`, 20)) return json({ error: "天气查询过于频繁，请稍后再试" }, 429, { "Retry-After": "60" });
  const { days, ...place } = parsed.data;
  try { return json(await getForecast(place, days)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "天气服务暂不可用" }, 502); }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
