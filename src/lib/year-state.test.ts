import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { createDb } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { sealEntry } from "@/lib/entries";
import { getYearState, maybeUnlock } from "@/lib/years";

const NOW = new Date(2026, 6, 14); // week 28

function seeded(): Ctx {
  const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
  sealEntry(c, { year: 2026, week: 28, content: "sealed this week", now: NOW });
  return c;
}

describe("getYearState", () => {
  it("classifies all 52 cells for the active year", () => {
    const { db } = seeded();
    const s = getYearState(db, 2026, NOW);
    expect(s.cells.length).toBe(52);
    expect(s.currentWeek).toBe(28);
    expect(s.cells[27]).toMatchObject({ week: 28, state: "sealed" }); // sealed wins over current
    expect(s.cells[26].state).toBe("missed");
    expect(s.cells[0].state).toBe("missed");
    expect(s.cells[28].state).toBe("future");
    expect(s.cells[51].state).toBe("future");
    expect(s.cells[0].dates).toBe("Jan 1 – Jan 7");
  });
  it("marks the current week 'current' when unsealed", () => {
    const db = createDb(":memory:");
    expect(getYearState(db, 2026, NOW).cells[27].state).toBe("current");
  });
  it("treats past years' empty cells as missed", () => {
    const { db } = seeded();
    maybeUnlock(db, 2026, new Date(2026, 11, 31));
    const s = getYearState(db, 2026, new Date(2027, 5, 1));
    expect(s.status).toBe("unlocked");
    expect(s.currentWeek).toBeNull();
    expect(s.cells[27].state).toBe("sealed");
    expect(s.cells[51].state).toBe("missed");
  });
});
