import { describe, expect, it } from "vitest";
import { trendWindow, trendSeries, nearestTrendIndex } from "./trend";
import type { Entry } from "./engine";
describe("spending chart", () => {
  it("clamps weekly windows at month boundaries including leap February", () => {
    expect(trendWindow(31, 7, 31)).toEqual({ start: 25, end: 31 });
    expect(trendWindow(31, 14, 5)).toEqual({ start: 1, end: 14 });
    expect(trendWindow(29, 21, 29)).toEqual({ start: 9, end: 29 });
    expect(trendWindow(28, 0, 10)).toEqual({ start: 1, end: 28 });
    expect(trendWindow(31, 7, 24)).toEqual({ start: 18, end: 24 });
  });
  it("snaps the full plot to the nearest day and clamps outside edges", () => {
    expect(nearestTrendIndex(-100, 58, 698, 31)).toBe(0);
    expect(nearestTrendIndex(378, 58, 698, 31)).toBe(15);
    expect(nearestTrendIndex(900, 58, 698, 31)).toBe(30);
    expect(nearestTrendIndex(100, 58, 698, 7)).toBe(0);
  });
  it("totals only the selected range, treats refunds as negative, ignores other flows", () => {
    const entry = (
      date: string,
      type: Entry["type"],
      amount: number,
    ): Entry => ({
      id: date + type,
      date,
      type,
      amount,
      description: "Test",
      categoryId: "",
    });
    const entries = [
      entry("2026-11-01", "expense", 999),
      entry("2026-11-08", "expense", 3000),
      entry("2026-11-09", "refund", 5000),
      entry("2026-11-09", "income", 100000),
      entry("2026-11-09", "transfer", 10000),
      entry("2026-12-08", "expense", 4000),
    ];
    expect(trendSeries(entries, "2026-11", 8, 10)).toEqual({
      daily: [3000, -5000, 0],
      cumulative: [3000, -2000, -2000],
    });
    expect(trendSeries([], "2026-11", 1, 3)).toEqual({
      daily: [0, 0, 0],
      cumulative: [0, 0, 0],
    });
  });
});
