import { eq } from "drizzle-orm";
import { years } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { listEntryMeta } from "@/lib/entries";
import { currentWeek, formatWeekDates } from "@/lib/weeks";
import { WEEKS_PER_YEAR } from "@/lib/config";

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

export type CellState = "sealed" | "current" | "missed" | "future";
export type Cell = { week: number; state: CellState; sealedAt: string | null; dates: string };
export type YearState = {
  year: number;
  status: "active" | "unlocked";
  unlockDate: string;
  currentWeek: number | null;
  cells: Cell[];
  reflection: { status: string; text: string | null; error: string | null };
};

export function getYearState(db: Db, year: number, now: Date): YearState {
  const row = getOrCreateYear(db, year);
  const metaByWeek = new Map(listEntryMeta(db, year).map((m) => [m.week, m]));
  const cw = currentWeek(now);
  const isCurrentYear = cw.year === year;

  const cells: Cell[] = [];
  for (let week = 1; week <= WEEKS_PER_YEAR; week++) {
    const meta = metaByWeek.get(week);
    let state: CellState;
    if (meta) state = "sealed";
    else if (isCurrentYear && week === cw.week) state = "current";
    else if (isCurrentYear && week > cw.week) state = "future";
    else state = "missed";
    cells.push({ week, state, sealedAt: meta?.sealedAt ?? null, dates: formatWeekDates(year, week) });
  }

  return {
    year,
    status: row.status,
    unlockDate: row.unlockDate,
    currentWeek: isCurrentYear ? cw.week : null,
    cells,
    reflection: { status: row.reflectionStatus, text: row.reflectionText, error: row.reflectionError },
  };
}
