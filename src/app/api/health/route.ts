import { NextResponse } from "next/server";
import { getScenicRegistry } from "@/lib/db/registry";
import { getDatabaseRuntimeStatus } from "@/lib/db/path";
import { getProviderStatus } from "@/lib/provider-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = getProviderStatus();
  const database = getDatabaseRuntimeStatus();
  const problems = [...provider.problems, ...database.problems];
  if (!database.configured) return response({
    status: "unhealthy",
    checkedAt: new Date().toISOString(),
    services: { database: "not configured", placeSearch: process.env.AMAP_API_KEY ? "amap" : "open-meteo", weather: provider.qweather.configured ? "qweather + open-meteo fallback" : "open-meteo", coordinateFallback: true },
    configuration: { weatherPreference: provider.preference, qweather: provider.qweather, problems },
  }, 503);
  try {
    const registry = await getScenicRegistry().search("黄山", 1);
    if (!registry.length) throw new Error("registry is empty");
    return response({
      status: problems.length ? "degraded" : "ok",
      checkedAt: new Date().toISOString(),
      services: {
        database: database.backend,
        placeSearch: process.env.AMAP_API_KEY ? "amap" : "open-meteo",
        weather: provider.preference !== "open-meteo" && provider.qweather.configured ? "qweather + open-meteo fallback" : "open-meteo",
        officialAlerts: provider.preference !== "open-meteo" && provider.qweather.configured ? "qweather" : "derived weather risks only",
        coordinateFallback: true,
      },
      configuration: {
        weatherPreference: provider.preference,
        qweather: provider.qweather,
        problems,
      },
    }, 200);
  } catch {
    return response({ status: "unhealthy", checkedAt: new Date().toISOString() }, 503);
  }
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
