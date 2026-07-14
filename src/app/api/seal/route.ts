import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { sealEntry, SealError } from "@/lib/entries";
import { readJson } from "../request";

export async function POST(req: Request) {
  const ctx = getCtx();
  const body = await readJson<{ week?: number; content?: string; promptId?: string }>(req);
  if (!body || !Number.isInteger(body.week)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    const result = sealEntry(ctx, {
      year: new Date().getFullYear(),
      week: body.week as number,
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
