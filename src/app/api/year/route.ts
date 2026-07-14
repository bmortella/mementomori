import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { readEntries } from "@/lib/entries";
import { runReflection } from "@/lib/reflection/job";
import { DEFAULT_ANCHOR_PROMPT, getSetting } from "@/lib/settings";
import { getYearState, maybeUnlock } from "@/lib/years";

export async function GET(req: Request) {
  const ctx = getCtx();
  const now = new Date();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());

  if (year !== now.getFullYear()) {
    const exists = ctx.db.select().from(years).where(eq(years.year, year)).get();
    if (!exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  maybeUnlock(ctx.db, year, now);
  const state = getYearState(ctx.db, year, now);
  if (state.status === "unlocked" && (state.reflection.status === "none" || state.reflection.status === "running")) {
    void runReflection(ctx, year);
    state.reflection.status = "running";
  }
  return NextResponse.json({
    ...state,
    anchorPrompt: getSetting(ctx.db, "anchor_prompt") ?? DEFAULT_ANCHOR_PROMPT,
    entries: state.status === "unlocked" ? readEntries(ctx, year) : null,
  });
}
