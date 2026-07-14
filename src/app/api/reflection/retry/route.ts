import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { runReflection } from "@/lib/reflection/job";
import { readJson } from "../../request";

export async function POST(req: Request) {
  const ctx = getCtx();
  const body = await readJson<{ year?: number }>(req);
  if (!body || !Number.isInteger(body.year)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const year = body.year as number;
  const row = ctx.db.select().from(years).where(eq(years.year, year)).get();
  if (!row || row.status !== "unlocked") {
    return NextResponse.json({ error: "YEAR_LOCKED" }, { status: 409 });
  }
  // No status gate: `runReflection`'s in-process inFlight set is the real
  // concurrency guard, so a crash-stranded "running" row stays retryable.
  ctx.db.update(years).set({ reflectionStatus: "none" }).where(eq(years.year, year)).run();
  void runReflection(ctx, year);
  return NextResponse.json({ status: "running" });
}
