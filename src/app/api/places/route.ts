import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/http";
import { searchPlaces } from "@/lib/adapters/places";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const client = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!checkRateLimit(`places:${client}`, 40)) return json({ error: "搜索过于频繁，请稍后再试" }, 429);
  if (query.length < 1 || query.length > 80) return json({ error: "请输入 1–80 个字符的景区名称、地址或坐标" }, 400);
  try { return json(await searchPlaces(query)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "地点服务暂不可用" }, 502); }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
