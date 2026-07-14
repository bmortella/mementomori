import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { listEntryMeta } from "@/lib/entries";

export async function GET() {
  const ctx = getCtx();
  const unlocked = ctx.db.select().from(years).where(eq(years.status, "unlocked")).orderBy(desc(years.year)).all();
  return NextResponse.json({
    years: unlocked.map((y) => ({ year: y.year, entryCount: listEntryMeta(ctx.db, y.year).length })),
  });
}
