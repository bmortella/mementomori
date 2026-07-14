import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { years } from "@/lib/db/schema";
import type { Ctx } from "@/lib/context";
import { sealEntry } from "@/lib/entries";
import { maybeUnlock } from "@/lib/years";
import { buildReflectionPrompt, type ReflectionProvider } from "@/lib/reflection/provider";
import { runReflection } from "@/lib/reflection/job";

function unlockedCtx(): Ctx {
  const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
  sealEntry(c, { year: 2026, week: 28, content: "I traded it for patience.", now: new Date(2026, 6, 14) });
  maybeUnlock(c.db, 2026, new Date(2026, 11, 31));
  return c;
}
const yearRow = (c: Ctx) => c.db.select().from(years).where(eq(years.year, 2026)).get()!;

describe("buildReflectionPrompt", () => {
  it("includes every entry with week dates and notes gaps", () => {
    const p = buildReflectionPrompt(2026, [
      { week: 28, dates: "Jul 9 – Jul 15", prompt: null, content: "I traded it for patience." },
    ]);
    expect(p).toContain("I traded it for patience.");
    expect(p).toContain("Jul 9 – Jul 15");
    expect(p).toContain("51"); // 51 missed weeks acknowledged
  });

  it("quotes the configured anchor prompt", () => {
    const p = buildReflectionPrompt(2026, [{ week: 1, dates: "Jan 1 – Jan 7", prompt: null, content: "x" }], "Custom anchor?");
    expect(p).toContain('"Custom anchor?"');
  });
});

describe("runReflection", () => {
  it("stores provider output on success", async () => {
    const c = unlockedCtx();
    const provider: ReflectionProvider = { generate: async () => "A year of patience." };
    await runReflection(c, 2026, provider);
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: "A year of patience." });
  });
  it("records failure and allows retry", async () => {
    const c = unlockedCtx();
    const bad: ReflectionProvider = { generate: async () => { throw new Error("api down"); } };
    await runReflection(c, 2026, bad);
    expect(yearRow(c).reflectionStatus).toBe("failed");
    expect(yearRow(c).reflectionError).toContain("api down");
    await runReflection(c, 2026, { generate: async () => "recovered" });
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: "recovered" });
  });
  it("does nothing while the year is locked", async () => {
    const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
    sealEntry(c, { year: 2026, week: 28, content: "x", now: new Date(2026, 6, 14) });
    await runReflection(c, 2026, { generate: async () => "nope" });
    expect(yearRow(c).reflectionStatus).toBe("none");
  });
  it("completes with null text when the year had no entries", async () => {
    const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
    maybeUnlock(c.db, 2026, new Date(2026, 11, 31));
    await runReflection(c, 2026, { generate: async () => "unused" });
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: null });
  });
});

describe("runReflection guards", () => {
  it("does not double-run concurrently in-process", async () => {
    const c = unlockedCtx();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow: ReflectionProvider = {
      generate: async () => { calls++; await gate; return "slow"; },
    };
    const first = runReflection(c, 2026, slow);
    const second = runReflection(c, 2026, slow);
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(yearRow(c).reflectionStatus).toBe("done");
  });

  it("recovers a row stranded in 'running' by a crashed process", async () => {
    const c = unlockedCtx();
    c.db.update(years).set({ reflectionStatus: "running" }).where(eq(years.year, 2026)).run();
    await runReflection(c, 2026, { generate: async () => "recovered after crash" });
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: "recovered after crash" });
  });
});
