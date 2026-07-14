import { WEEKS_PER_YEAR } from "@/lib/config";

function dayOfYear(d: Date): number {
  // 0-based; uses calendar dates so DST shifts can't skew the count
  const start = Date.UTC(d.getFullYear(), 0, 1);
  const cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((cur - start) / 86_400_000);
}

export function currentWeek(now: Date): { year: number; week: number } {
  const week = Math.min(Math.floor(dayOfYear(now) / 7) + 1, WEEKS_PER_YEAR);
  return { year: now.getFullYear(), week };
}

export function weekRange(year: number, week: number): { start: Date; end: Date } {
  const start = new Date(year, 0, 1 + (week - 1) * 7);
  const end =
    week === WEEKS_PER_YEAR
      ? new Date(year + 1, 0, 1)
      : new Date(year, 0, 1 + week * 7);
  return { start, end };
}

const FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function formatWeekDates(year: number, week: number): string {
  const { start, end } = weekRange(year, week);
  const lastDay = new Date(end.getTime() - 86_400_000);
  return `${FMT.format(start)} – ${FMT.format(lastDay)}`;
}
