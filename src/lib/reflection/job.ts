import { eq } from "drizzle-orm";
import type { Ctx } from "@/lib/context";
import { dataDir } from "@/lib/config";
import { years } from "@/lib/db/schema";
import { readEntries } from "@/lib/entries";
import { loadPrompts } from "@/lib/prompts";
import { formatWeekDates } from "@/lib/weeks";
import { DEFAULT_ANCHOR_PROMPT, getSetting } from "@/lib/settings";
import { getProvider, type ReflectionEntry, type ReflectionProvider } from "./provider";

// DB status is for display; this in-process set is the concurrency guard, so a
// crash that strands a row in "running" can't block reruns after restart.
const inFlight = new Set<number>();

export async function runReflection(ctx: Ctx, year: number, provider?: ReflectionProvider): Promise<void> {
  const row = ctx.db.select().from(years).where(eq(years.year, year)).get();
  if (!row || row.status !== "unlocked" || inFlight.has(year)) return;
  inFlight.add(year);
  try {
    ctx.db.update(years).set({ reflectionStatus: "running", reflectionError: null }).where(eq(years.year, year)).run();
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
    const anchorPrompt = getSetting(ctx.db, "anchor_prompt") ?? DEFAULT_ANCHOR_PROMPT;
    const text = await (provider ?? getProvider(ctx.db, ctx.key)).generate(year, entries, anchorPrompt);
    ctx.db.update(years).set({ reflectionStatus: "done", reflectionText: text }).where(eq(years.year, year)).run();
  } catch (e) {
    ctx.db
      .update(years)
      .set({ reflectionStatus: "failed", reflectionError: e instanceof Error ? e.message : String(e) })
      .where(eq(years.year, year))
      .run();
  } finally {
    inFlight.delete(year);
  }
}
