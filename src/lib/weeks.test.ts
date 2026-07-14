import { describe, it, expect } from "vitest";
import { currentWeek, weekRange, formatWeekDates } from "@/lib/weeks";

describe("currentWeek", () => {
  it("maps Jan 1 to week 1 and Jan 7 to week 1", () => {
    expect(currentWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    expect(currentWeek(new Date(2026, 0, 7))).toEqual({ year: 2026, week: 1 });
  });
  it("maps Jan 8 to week 2", () => {
    expect(currentWeek(new Date(2026, 0, 8)).week).toBe(2);
  });
  it("caps the year's tail into week 52 (non-leap)", () => {
    expect(currentWeek(new Date(2026, 11, 31)).week).toBe(52); // day 365 would be week 53
    expect(currentWeek(new Date(2026, 11, 24)).week).toBe(52); // first day of week 52
    expect(currentWeek(new Date(2026, 11, 23)).week).toBe(51);
  });
  it("caps both extra days in a leap year", () => {
    expect(currentWeek(new Date(2028, 11, 30)).week).toBe(52);
    expect(currentWeek(new Date(2028, 11, 31)).week).toBe(52);
  });
});

describe("weekRange", () => {
  it("week 1 starts Jan 1", () => {
    const { start } = weekRange(2026, 1);
    expect(start).toEqual(new Date(2026, 0, 1));
  });
  it("week 52 ends at next Jan 1 (exclusive), absorbing the tail", () => {
    const { start, end } = weekRange(2026, 52);
    expect(start).toEqual(new Date(2026, 11, 24));
    expect(end).toEqual(new Date(2027, 0, 1));
  });
  it("ordinary weeks are 7 days", () => {
    const { start, end } = weekRange(2026, 2);
    expect(start).toEqual(new Date(2026, 0, 8));
    expect(end).toEqual(new Date(2026, 0, 15));
  });
});

describe("formatWeekDates", () => {
  it("formats inclusive range", () => {
    expect(formatWeekDates(2026, 2)).toBe("Jan 8 – Jan 14");
  });
  it("stays on the correct calendar day across DST transitions", () => {
    // Week 10 of 2029 ends Mar 11 (inclusive) — a US spring-forward window
    expect(formatWeekDates(2029, 10)).toBe("Mar 5 – Mar 11");
  });
});
