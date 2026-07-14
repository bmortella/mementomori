import { eq } from "drizzle-orm";
import type { Ctx } from "@/lib/context";
import { dataDir } from "@/lib/config";
import { years } from "@/lib/db/schema";
import { readEntries } from "@/lib/entries";
import { loadPrompts } from "@/lib/prompts";
import { formatWeekDates } from "@/lib/weeks";
import { getProvider, type ReflectionEntry, type ReflectionProvider } from "./provider";

export async function runReflection(ctx: Ctx, year: number, provider?: ReflectionProvider): Promise<void> {
  const row = ctx.db.select().from(years).where(eq(years.year, year)).get();
  if (!row || row.status !== "unlocked" || row.reflectionStatus === "running") return;

  ctx.db.update(years).set({ reflectionStatus: "running", reflectionError: null }).where(eq(years.year, year)).run();
  try {
    const raw = readEntries(ctx, year);
    if (raw.length === 0) {
      ctx.db.update(years).set({ reflectionStatus: "done", reflectionText: null }).where(eq(years.year, year)).run();
      return;
    }
    const pool = new Map(loadPrompts(dataDir()).map((p) => [p.id, p.text]));
    const entries: ReflectionEntry[] = raw.map((e) => ({
      week: e.week,
      dates: formatWeekDates(year, e.week),
      prompt: e.promptId ? (pool.get(e.promptId) ?? null) : null,
      content: e.content,
    }));
    const text = await (provider ?? getProvider(ctx.db)).generate(year, entries);
    ctx.db.update(years).set({ reflectionStatus: "done", reflectionText: text }).where(eq(years.year, year)).run();
  } catch (e) {
    ctx.db
      .update(years)
      .set({ reflectionStatus: "failed", reflectionError: e instanceof Error ? e.message : String(e) })
      .where(eq(years.year, year))
      .run();
  }
}
