import { NextResponse } from "next/server";
import { getScenicRegistry } from "@/lib/db/registry";
import { getProviderStatus } from "@/lib/provider-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const registry = await getScenicRegistry().search("黄山", 1);
    if (!registry.length) throw new Error("registry is empty");
    const provider = getProviderStatus();
    return response({
      status: provider.problems.length ? "degraded" : "ok",
      checkedAt: new Date().toISOString(),
      services: {
        database: process.env.DATABASE_URL ? "postgresql" : "sqlite",
        placeSearch: process.env.AMAP_API_KEY ? "amap" : "open-meteo",
        weather: provider.preference !== "open-meteo" && provider.qweather.configured ? "qweather + open-meteo fallback" : "open-meteo",
        officialAlerts: provider.preference !== "open-meteo" && provider.qweather.configured ? "qweather" : "derived weather risks only",
        coordinateFallback: true,
      },
      configuration: {
        weatherPreference: provider.preference,
        qweather: provider.qweather,
        problems: provider.problems,
      },
    }, 200);
  } catch {
    return response({ status: "unhealthy", checkedAt: new Date().toISOString() }, 503);
  }
}

function response(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
