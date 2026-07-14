import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { sealEntry, SealError } from "@/lib/entries";

export async function POST(req: Request) {
  const ctx = getCtx();
  const body = (await req.json()) as { week?: number; content?: string; promptId?: string };
  try {
    const result = sealEntry(ctx, {
      year: new Date().getFullYear(),
      week: Number(body.week),
      content: String(body.content ?? ""),
      promptId: body.promptId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof SealError) {
      const status = e.code === "ALREADY_SEALED" || e.code === "WRONG_WEEK" ? 409 : 400;
      return NextResponse.json({ error: e.code }, { status });
    }
    throw e;
  }
}
