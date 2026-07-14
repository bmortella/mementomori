import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { entries, years } from "@/lib/db/schema";
import type { Ctx } from "@/lib/context";
import { sealEntry, SealError, listEntryMeta, readEntries } from "@/lib/entries";
import { maybeUnlock } from "@/lib/years";

const NOW = new Date(2026, 6, 14); // Tue Jul 14 2026 → week 28
function ctx(): Ctx {
  return { db: createDb(":memory:"), key: randomBytes(32) };
}
const ok = { year: 2026, week: 28, content: "A quiet, honest week.", now: NOW };

function code(fn: () => unknown): string {
  try { fn(); } catch (e) { if (e instanceof SealError) return e.code; throw e; }
  throw new Error("did not throw");
}

describe("sealEntry", () => {
  it("stores ciphertext, not plaintext", () => {
    const c = ctx();
    const { sealedAt } = sealEntry(c, ok);
    expect(sealedAt).toBe(NOW.toISOString());
    const row = c.db.select().from(entries).get()!;
    expect(row.ciphertext.includes(Buffer.from("honest"))).toBe(false);
  });
  it("rejects seals for any week but the current one", () => {
    expect(code(() => sealEntry(ctx(), { ...ok, week: 27 }))).toBe("WRONG_WEEK");
    expect(code(() => sealEntry(ctx(), { ...ok, week: 29 }))).toBe("WRONG_WEEK");
    expect(code(() => sealEntry(ctx(), { ...ok, year: 2025 }))).toBe("WRONG_WEEK");
  });
  it("rejects double-seal without overwriting", () => {
    const c = ctx();
    sealEntry(c, ok);
    expect(code(() => sealEntry(c, { ...ok, content: "second try" }))).toBe("ALREADY_SEALED");
    expect(c.db.select().from(entries).all().length).toBe(1);
  });
  it("enforces the content rules", () => {
    expect(code(() => sealEntry(ctx(), { ...ok, content: "  " }))).toBe("EMPTY");
    expect(code(() => sealEntry(ctx(), { ...ok, content: "one\ntwo" }))).toBe("MULTI_PARAGRAPH");
    expect(code(() => sealEntry(ctx(), { ...ok, content: "x".repeat(501) }))).toBe("TOO_LONG");
    expect(() => sealEntry(ctx(), { ...ok, content: "x".repeat(500) })).not.toThrow();
  });
  it("still accepts the current week after unlock", () => {
    const c = ctx();
    const dec31 = new Date(2026, 11, 31, 9, 0);
    maybeUnlock(c.db, 2026, dec31);
    expect(() => sealEntry(c, { year: 2026, week: 52, content: "The last one.", now: dec31 })).not.toThrow();
  });
});

describe("reading", () => {
  it("meta never includes content; readEntries requires unlock", () => {
    const c = ctx();
    sealEntry(c, { ...ok, promptId: "fear-unrealized" });
    const meta = listEntryMeta(c.db, 2026);
    expect(meta).toEqual([{ week: 28, sealedAt: NOW.toISOString(), promptId: "fear-unrealized" }]);
    expect(() => readEntries(c, 2026)).toThrow("YEAR_LOCKED");
    c.db.update(years).set({ status: "unlocked" }).where(eq(years.year, 2026)).run();
    expect(readEntries(c, 2026)[0].content).toBe("A quiet, honest week.");
  });
});
