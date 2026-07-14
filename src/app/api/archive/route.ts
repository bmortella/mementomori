import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { listEntryMeta } from "@/lib/entries";
import { maybeUnlock } from "@/lib/years";

export async function GET() {
  const ctx = getCtx();
  const now = new Date();
  // Sweep past-due active years: a first visit in January must still surface
  // the finished year (spec: unlock happens on any page load on/after the date).
  for (const y of ctx.db.select().from(years).where(eq(years.status, "active")).all()) {
    maybeUnlock(ctx.db, y.year, now);
  }
  const unlocked = ctx.db.select().from(years).where(eq(years.status, "unlocked")).orderBy(desc(years.year)).all();
  return NextResponse.json({
    years: unlocked.map((y) => ({ year: y.year, entryCount: listEntryMeta(ctx.db, y.year).length })),
  });
}
