import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { createDb } from "@/lib/db";
import { years, entries, settings } from "@/lib/db/schema";
import { verifyCanary } from "@/lib/context";

describe("createDb", () => {
  it("creates tables and enforces unique (year, week)", () => {
    const db = createDb(":memory:");
    db.insert(years).values({ year: 2026, unlockDate: "2026-12-31" }).run();
    const row = { year: 2026, weekNumber: 1, sealedAt: "t", ciphertext: Buffer.from("c"), nonce: Buffer.from("n") };
    db.insert(entries).values(row).run();
    expect(() => db.insert(entries).values(row).run()).toThrow(/UNIQUE/);
  });
  it("years default to active with no reflection", () => {
    const db = createDb(":memory:");
    db.insert(years).values({ year: 2026, unlockDate: "2026-12-31" }).run();
    const y = db.select().from(years).get()!;
    expect(y.status).toBe("active");
    expect(y.reflectionStatus).toBe("none");
  });
});

describe("verifyCanary", () => {
  it("plants a canary then accepts the same key", () => {
    const db = createDb(":memory:");
    const key = randomBytes(32);
    verifyCanary(db, key);
    expect(() => verifyCanary(db, key)).not.toThrow();
    expect(db.select().from(settings).all().some((s) => s.key === "canary")).toBe(true);
  });
  it("rejects a different key", () => {
    const db = createDb(":memory:");
    verifyCanary(db, randomBytes(32));
    expect(() => verifyCanary(db, randomBytes(32))).toThrow(/does not match/);
  });
});
