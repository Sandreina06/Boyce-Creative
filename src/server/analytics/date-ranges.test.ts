import { describe, expect, it } from "vitest";
import { addMonths, resolveComparison, resolveDatesFromParams, resolveRange, todayIn } from "./date-ranges";

const TODAY = "2026-09-23";

describe("resolveRange", () => {
  it("excludes today for last N days (Meta convention)", () => {
    expect(resolveRange("last_7d", TODAY)).toEqual({ from: "2026-09-16", to: "2026-09-22" });
    expect(resolveRange("last_30d", TODAY)).toEqual({ from: "2026-08-24", to: "2026-09-22" });
  });
  it("handles today / yesterday / months", () => {
    expect(resolveRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(resolveRange("yesterday", TODAY)).toEqual({ from: "2026-09-22", to: "2026-09-22" });
    expect(resolveRange("this_month", TODAY)).toEqual({ from: "2026-09-01", to: TODAY });
    expect(resolveRange("last_month", TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(resolveRange("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("validates and orders custom ranges, clamping to today", () => {
    expect(resolveRange("custom", TODAY, { from: "2026-09-10", to: "2026-09-01" })).toEqual({ from: "2026-09-01", to: "2026-09-10" });
    expect(resolveRange("custom", TODAY, { from: "2026-09-10", to: "2026-12-01" })).toEqual({ from: "2026-09-10", to: TODAY });
    expect(resolveRange("custom", TODAY, { from: "garbage", to: "2026-09-01" })).toEqual(resolveRange("last_30d", TODAY));
  });
});

describe("resolveComparison", () => {
  it("previous period has identical length and ends the day before", () => {
    expect(resolveComparison({ from: "2026-09-16", to: "2026-09-22" }, "previous_period")).toEqual({ from: "2026-09-09", to: "2026-09-15" });
  });
  it("previous month maps full months to full months", () => {
    expect(resolveComparison({ from: "2026-09-01", to: "2026-09-30" }, "previous_month")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(resolveComparison({ from: "2026-03-01", to: "2026-03-31" }, "previous_month")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("previous month shifts partial ranges day-for-day with clamping", () => {
    expect(resolveComparison({ from: "2026-09-01", to: "2026-09-23" }, "previous_month")).toEqual({ from: "2026-08-01", to: "2026-08-23" });
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("previous year and none", () => {
    expect(resolveComparison({ from: "2026-09-16", to: "2026-09-22" }, "previous_year")).toEqual({ from: "2025-09-16", to: "2025-09-22" });
    expect(resolveComparison({ from: "2026-09-16", to: "2026-09-22" }, "none")).toBeNull();
  });
});

describe("timezones", () => {
  it("computes today in the client's timezone", () => {
    const now = new Date("2026-09-24T02:30:00Z"); // 22:30 on the 23rd in New York
    expect(todayIn("America/New_York", now)).toBe("2026-09-23");
    expect(todayIn("Europe/London", now)).toBe("2026-09-24");
  });
  it("ignores invalid params", () => {
    const r = resolveDatesFromParams({ range: "bogus", compare: "bogus" }, "UTC", new Date("2026-09-23T12:00:00Z"));
    expect(r.preset).toBe("last_30d");
    expect(r.compare).toBe("previous_period");
  });
});
