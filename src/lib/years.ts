import { eq } from "drizzle-orm";
import { years } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export type YearRow = typeof years.$inferSelect;

export function getOrCreateYear(db: Db, year: number): YearRow {
  const unlockDay = getSetting(db, "unlock_day") ?? "12-31";
  db.insert(years)
    .values({ year, unlockDate: `${year}-${unlockDay}` })
    .onConflictDoNothing()
    .run();
  return db.select().from(years).where(eq(years.year, year)).get()!;
}

export function maybeUnlock(db: Db, year: number, now: Date): boolean {
  const row = getOrCreateYear(db, year);
  if (row.status === "unlocked") return false;
  const [y, m, d] = row.unlockDate.split("-").map(Number);
  const unlockAt = new Date(y, m - 1, d); // local midnight
  if (now.getTime() < unlockAt.getTime()) return false;
  db.update(years).set({ status: "unlocked" }).where(eq(years.year, year)).run();
  return true;
}
