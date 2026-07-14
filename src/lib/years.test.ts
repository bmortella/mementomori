import { describe, it, expect } from "vitest";
import { createDb } from "@/lib/db";
import { getOrCreateYear, maybeUnlock } from "@/lib/years";
import { getSetting, setSetting } from "@/lib/settings";

describe("settings", () => {
  it("get/set round-trips and overwrites", () => {
    const db = createDb(":memory:");
    expect(getSetting(db, "anchor_prompt")).toBeNull();
    setSetting(db, "anchor_prompt", "One?");
    setSetting(db, "anchor_prompt", "Two?");
    expect(getSetting(db, "anchor_prompt")).toBe("Two?");
  });
});

describe("getOrCreateYear", () => {
  it("creates lazily with Dec 31 unlock and is idempotent", () => {
    const db = createDb(":memory:");
    const y = getOrCreateYear(db, 2026);
    expect(y).toMatchObject({ year: 2026, unlockDate: "2026-12-31", status: "active" });
    expect(getOrCreateYear(db, 2026).year).toBe(2026);
  });
  it("honors the unlock_day setting for new years", () => {
    const db = createDb(":memory:");
    setSetting(db, "unlock_day", "11-30");
    expect(getOrCreateYear(db, 2027).unlockDate).toBe("2027-11-30");
  });
});

describe("maybeUnlock", () => {
  it("stays active before the unlock date", () => {
    const db = createDb(":memory:");
    expect(maybeUnlock(db, 2026, new Date(2026, 11, 30, 23, 59))).toBe(false);
    expect(getOrCreateYear(db, 2026).status).toBe("active");
  });
  it("unlocks on the date, idempotently", () => {
    const db = createDb(":memory:");
    expect(maybeUnlock(db, 2026, new Date(2026, 11, 31, 0, 0))).toBe(true);
    expect(getOrCreateYear(db, 2026).status).toBe("unlocked");
    expect(maybeUnlock(db, 2026, new Date(2027, 0, 2))).toBe(false);
  });
});
