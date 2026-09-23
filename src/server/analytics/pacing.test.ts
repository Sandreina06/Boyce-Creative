import { describe, expect, it } from "vitest";
import { computePacing, pacingStatus } from "./pacing";

const T = { onTrackPct: 10, criticalPct: 25 };

describe("computePacing", () => {
  it("computes expected spend, run rate and projection", () => {
    // Sept (30 days), start of the 16th: 15 complete days at $100/day.
    const p = computePacing({
      monthlyBudget: 3000,
      spendToDate: 1500,
      spendThroughYesterday: 1500,
      dayOfMonth: 16,
      daysInMonth: 30,
      todayFraction: 0,
      thresholds: T,
    });
    expect(p.expectedSpendToDate).toBe(1500);
    expect(p.averageDailySpend).toBe(100);
    expect(p.projectedMonthEndSpend).toBe(3000);
    expect(p.requiredDailySpend).toBe(100);
    expect(p.status).toBe("on_track");
  });
  it("flags over pacing, under pacing and critical from projected variance", () => {
    expect(pacingStatus(15, false, T)).toBe("over_pacing");
    expect(pacingStatus(-15, false, T)).toBe("under_pacing");
    expect(pacingStatus(30, false, T)).toBe("critical");
    expect(pacingStatus(-30, false, T)).toBe("critical");
    expect(pacingStatus(0, true, T)).toBe("critical");
  });
  it("reports no_budget without inventing a budget", () => {
    const p = computePacing({
      monthlyBudget: null,
      spendToDate: 100,
      spendThroughYesterday: 80,
      dayOfMonth: 5,
      daysInMonth: 30,
      todayFraction: 0.5,
      thresholds: T,
    });
    expect(p.status).toBe("no_budget");
    expect(p.variance).toBeNull();
  });
});
