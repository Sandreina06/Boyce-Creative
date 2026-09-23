import type { PacingThresholds } from "../db/schema";

export type PacingStatus = "on_track" | "under_pacing" | "over_pacing" | "critical" | "no_budget";

export type PacingInput = {
  monthlyBudget: number | null;
  /** Spend from the 1st of the month through today (today may be partial). */
  spendToDate: number;
  /** Spend from the 1st through yesterday (complete days only). */
  spendThroughYesterday: number;
  /** Day of month of "today" in the client's timezone (1-based). */
  dayOfMonth: number;
  daysInMonth: number;
  /** Fraction of today elapsed in the client's timezone (0–1). */
  todayFraction: number;
  thresholds: PacingThresholds;
};

export type Pacing = {
  status: PacingStatus;
  monthlyBudget: number | null;
  spendToDate: number;
  pctBudgetUsed: number | null;
  pctMonthElapsed: number;
  expectedSpendToDate: number | null;
  /** spendToDate − expectedSpendToDate */
  variance: number | null;
  variancePct: number | null;
  averageDailySpend: number;
  /** Daily spend needed for the rest of the month to land exactly on budget. */
  requiredDailySpend: number | null;
  projectedMonthEndSpend: number;
  projectedVariance: number | null;
  projectedVariancePct: number | null;
  daysRemaining: number;
};

export function computePacing(i: PacingInput): Pacing {
  const elapsedDays = i.dayOfMonth - 1 + i.todayFraction;
  const pctMonthElapsed = (elapsedDays / i.daysInMonth) * 100;
  const completedDays = i.dayOfMonth - 1;

  // Run rate from complete days; on the 1st fall back to today's partial pace.
  const averageDailySpend =
    completedDays > 0
      ? i.spendThroughYesterday / completedDays
      : i.todayFraction > 0
        ? i.spendToDate / i.todayFraction
        : 0;

  const remainingDays = i.daysInMonth - elapsedDays;
  const projectedMonthEndSpend = i.spendToDate + averageDailySpend * remainingDays;

  const base = {
    monthlyBudget: i.monthlyBudget,
    spendToDate: i.spendToDate,
    pctMonthElapsed,
    averageDailySpend,
    projectedMonthEndSpend,
    daysRemaining: Math.max(0, Math.ceil(remainingDays)),
  };

  if (!i.monthlyBudget || i.monthlyBudget <= 0) {
    return {
      ...base,
      status: "no_budget",
      pctBudgetUsed: null,
      expectedSpendToDate: null,
      variance: null,
      variancePct: null,
      requiredDailySpend: null,
      projectedVariance: null,
      projectedVariancePct: null,
    };
  }

  const budget = i.monthlyBudget;
  const expectedSpendToDate = budget * (elapsedDays / i.daysInMonth);
  const variance = i.spendToDate - expectedSpendToDate;
  const variancePct = expectedSpendToDate > 0 ? (variance / expectedSpendToDate) * 100 : null;
  const projectedVariance = projectedMonthEndSpend - budget;
  const projectedVariancePct = (projectedVariance / budget) * 100;
  const requiredDailySpend = remainingDays > 0 ? Math.max(0, budget - i.spendToDate) / remainingDays : null;

  return {
    ...base,
    status: pacingStatus(projectedVariancePct, i.spendToDate > budget, i.thresholds),
    pctBudgetUsed: (i.spendToDate / budget) * 100,
    expectedSpendToDate,
    variance,
    variancePct,
    requiredDailySpend,
    projectedVariance,
    projectedVariancePct,
  };
}

/** Status is judged on projected month-end variance, which is stable early in the month. */
export function pacingStatus(
  projectedVariancePct: number,
  alreadyOverBudget: boolean,
  t: PacingThresholds,
): PacingStatus {
  if (alreadyOverBudget || Math.abs(projectedVariancePct) > t.criticalPct) return "critical";
  if (projectedVariancePct > t.onTrackPct) return "over_pacing";
  if (projectedVariancePct < -t.onTrackPct) return "under_pacing";
  return "on_track";
}

export const PACING_LABEL: Record<PacingStatus, string> = {
  on_track: "On track",
  under_pacing: "Under pacing",
  over_pacing: "Over pacing",
  critical: "Critical",
  no_budget: "No budget set",
};
