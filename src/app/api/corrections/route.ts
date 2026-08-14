import { NextResponse } from "next/server";
import { z } from "zod";
import { getScenicRegistry } from "@/lib/db/registry";
import { checkRateLimit } from "@/lib/http";

const schema = z.object({
  scenicPlaceId: z.string().max(120).optional(),
  submittedName: z.string().min(1).max(80),
  reason: z.string().min(4).max(500),
  proposed: z.object({ name: z.string().max(80).optional(), province: z.string().max(40).optional(), city: z.string().max(40).optional(), address: z.string().max(160).optional(), latitude: z.number().min(3).max(54).optional(), longitude: z.number().min(73).max(136).optional() }),
});

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!checkRateLimit(`correction:${client}`, 8, 3_600_000)) return NextResponse.json({ error: "提交过于频繁，请稍后再试" }, { status: 429 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "纠错信息不完整" }, { status: 400 });
    const id = await getScenicRegistry().submitCorrection(parsed.data);
    return NextResponse.json({ id, status: "pending", message: "纠错已提交，审核后才会更新正式数据" }, { status: 201 });
  } catch { return NextResponse.json({ error: "暂时无法提交纠错" }, { status: 500 }); }
}
