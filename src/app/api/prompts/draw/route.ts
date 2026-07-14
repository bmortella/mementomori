import { NextResponse } from "next/server";
import { dataDir } from "@/lib/config";
import { getCtx } from "@/lib/context";
import { listEntryMeta } from "@/lib/entries";
import { drawPrompt, loadPrompts } from "@/lib/prompts";

export async function POST(_req: Request) {
  const ctx = getCtx();
  const year = new Date().getFullYear();
  const usedIds = listEntryMeta(ctx.db, year)
    .map((m) => m.promptId)
    .filter((id): id is string => id !== null);
  return NextResponse.json(drawPrompt(loadPrompts(dataDir()), usedIds));
}
