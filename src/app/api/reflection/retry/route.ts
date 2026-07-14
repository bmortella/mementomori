import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { runReflection } from "@/lib/reflection/job";

export async function POST(req: Request) {
  const ctx = getCtx();
  const { year } = (await req.json()) as { year: number };
  const row = ctx.db.select().from(years).where(eq(years.year, year)).get();
  if (!row || row.status !== "unlocked") {
    return NextResponse.json({ error: "YEAR_LOCKED" }, { status: 409 });
  }
  if (row.reflectionStatus !== "running") {
    ctx.db.update(years).set({ reflectionStatus: "none" }).where(eq(years.year, year)).run();
    void runReflection(ctx, year);
  }
  return NextResponse.json({ status: "running" });
}
