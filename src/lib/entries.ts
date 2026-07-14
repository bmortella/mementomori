import { asc, eq } from "drizzle-orm";
import { MAX_ENTRY_CHARS } from "@/lib/config";
import type { Ctx } from "@/lib/context";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { currentWeek } from "@/lib/weeks";
import { getOrCreateYear } from "@/lib/years";

export type SealErrorCode = "WRONG_WEEK" | "ALREADY_SEALED" | "TOO_LONG" | "MULTI_PARAGRAPH" | "EMPTY";

export class SealError extends Error {
  constructor(public code: SealErrorCode) {
    super(code);
  }
}

export function sealEntry(
  ctx: Ctx,
  input: { year: number; week: number; content: string; promptId?: string; now?: Date },
): { sealedAt: string } {
  const now = input.now ?? new Date();
  const cw = currentWeek(now);
  if (input.year !== cw.year || input.week !== cw.week) throw new SealError("WRONG_WEEK");
  const content = input.content.trim();
  if (content.length === 0) throw new SealError("EMPTY");
  if (/[\r\n]/.test(content)) throw new SealError("MULTI_PARAGRAPH");
  if (content.length > MAX_ENTRY_CHARS) throw new SealError("TOO_LONG");

  getOrCreateYear(ctx.db, input.year);
  const { ciphertext, nonce } = encrypt(ctx.key, content);
  const sealedAt = now.toISOString();
  try {
    ctx.db
      .insert(entries)
      .values({ year: input.year, weekNumber: input.week, sealedAt, ciphertext, nonce, promptId: input.promptId ?? null })
      .run();
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) throw new SealError("ALREADY_SEALED");
    throw e;
  }
  return { sealedAt };
}

export type EntryMeta = { week: number; sealedAt: string; promptId: string | null };

export function listEntryMeta(db: Db, year: number): EntryMeta[] {
  return db
    .select()
    .from(entries)
    .where(eq(entries.year, year))
    .orderBy(asc(entries.weekNumber))
    .all()
    .map((r) => ({ week: r.weekNumber, sealedAt: r.sealedAt, promptId: r.promptId }));
}

export function readEntries(ctx: Ctx, year: number): Array<EntryMeta & { content: string }> {
  const row = getOrCreateYear(ctx.db, year);
  if (row.status !== "unlocked") throw new Error("YEAR_LOCKED");
  return ctx.db
    .select()
    .from(entries)
    .where(eq(entries.year, year))
    .orderBy(asc(entries.weekNumber))
    .all()
    .map((r) => ({
      week: r.weekNumber,
      sealedAt: r.sealedAt,
      promptId: r.promptId,
      content: decrypt(ctx.key, r.ciphertext, r.nonce),
    }));
}
