import { addDays } from "./date-ranges";
import { compareValues, type Comparison } from "./compare";
import { derive, sumBase, type BaseMetrics, type Derived } from "./metrics";
import type { ChangeCategory, EntityKind } from "./activity";

/**
 * Before/after comparison around a change. This shows what coincided with the
 * change — it does NOT establish that the change caused it (seasonality,
 * auction dynamics and other edits all overlap).
 */

export const IMPACT_WINDOW_DAYS = 7;
export const MIN_AFTER_DAYS = 3;

export type ImpactLevel = "ad" | "adset" | "campaign" | "account";

/**
 * Where to measure a change. Turning something off (or launching something new)
 * zeroes that object's own before/after, so those are measured one level up.
 */
export function measurementLevel(
  category: ChangeCategory,
  entity: EntityKind,
): { level: ImpactLevel; useParent: boolean } {
  const structural = category.endsWith("_status") || category === "campaign_structure" || (category === "creative" && entity === "ad");
  switch (entity) {
    case "ad":
      return structural ? { level: "adset", useParent: true } : { level: "ad", useParent: false };
    case "adset":
      return structural ? { level: "campaign", useParent: true } : { level: "adset", useParent: false };
    case "campaign":
      return structural ? { level: "account", useParent: true } : { level: "campaign", useParent: false };
    default:
      return { level: "account", useParent: false };
  }
}

export type ImpactMetric = "spendPerDay" | "resultsPerDay" | "cpr" | "ctr" | "cpc" | "cpm" | "cvr" | "roas";

export type Impact = {
  status: "complete" | "partial" | "too_early" | "no_data";
  beforeDays: number;
  afterDays: number;
  before: Derived | null;
  after: Derived | null;
  metrics: Partial<Record<ImpactMetric, Comparison>>;
};

/**
 * @param changeDate  YYYY-MM-DD in the account's timezone. The change day itself is excluded.
 * @param daily       date → metrics for the measured entity.
 * @param lastCompleteDay  most recent complete day (yesterday in the account's timezone).
 */
export function computeImpact(
  changeDate: string,
  daily: Map<string, BaseMetrics>,
  lastCompleteDay: string,
  hasRevenue: boolean,
  windowDays = IMPACT_WINDOW_DAYS,
): Impact {
  const before: BaseMetrics[] = [];
  const after: BaseMetrics[] = [];
  for (let i = 1; i <= windowDays; i++) {
    const b = daily.get(addDays(changeDate, -i));
    if (b) before.push(b);
    const aDate = addDays(changeDate, i);
    if (aDate <= lastCompleteDay) {
      const a = daily.get(aDate);
      if (a) after.push(a);
    }
  }
  const afterDaysAvailable = Math.max(0, Math.min(windowDays, dayDiff(changeDate, lastCompleteDay)));
  const status: Impact["status"] =
    afterDaysAvailable < MIN_AFTER_DAYS ? "too_early" : !before.length || !after.length ? "no_data" : afterDaysAvailable < windowDays ? "partial" : "complete";

  if (status === "too_early" || status === "no_data") {
    return { status, beforeDays: before.length, afterDays: after.length, before: null, after: null, metrics: {} };
  }
  const bSum = sumBase(before);
  const aSum = sumBase(after);
  const bd = derive(bSum);
  const ad = derive(aSum);
  const perDay = (v: number | null, n: number) => (v == null || !n ? null : v / n);
  const metrics: Impact["metrics"] = {
    spendPerDay: compareValues(perDay(ad.spend, after.length), perDay(bd.spend, before.length), "neutral"),
    resultsPerDay: compareValues(perDay(ad.results, after.length), perDay(bd.results, before.length), "higher_better"),
    cpr: compareValues(ad.cpr, bd.cpr, "lower_better"),
    ctr: compareValues(ad.ctr, bd.ctr, "higher_better"),
    cpc: compareValues(ad.cpc, bd.cpc, "lower_better"),
    cpm: compareValues(ad.cpm, bd.cpm, "lower_better"),
    cvr: compareValues(ad.cvr, bd.cvr, "higher_better"),
    ...(hasRevenue ? { roas: compareValues(ad.roas, bd.roas, "higher_better") } : {}),
  };
  return { status, beforeDays: before.length, afterDays: after.length, before: bd, after: ad, metrics };
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * One-sentence readout of an impact. Uses "coincided with" language only —
 * never claims the change caused the movement.
 */
export function summarizeImpact(impact: Impact, costLabel: string, resultLabel: string, where: string): string | null {
  if (impact.status !== "complete" && impact.status !== "partial") return null;
  const cpr = impact.metrics.cpr;
  const vol = impact.metrics.resultsPerDay;
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;
  const parts: string[] = [];
  if (cpr?.pct != null && Math.abs(cpr.pct) >= 10) parts.push(`${costLabel} ${cpr.pct > 0 ? "rose" : "fell"} ${pct(cpr.pct)}`);
  if (vol?.pct != null && Math.abs(vol.pct) >= 10) parts.push(`${resultLabel.toLowerCase()} per day ${vol.pct > 0 ? "rose" : "fell"} ${pct(vol.pct)}`);
  const lead = impact.status === "partial" ? "So far, " : "";
  if (!parts.length) return `${lead}No meaningful change in ${costLabel} or ${resultLabel.toLowerCase()} at ${where} after this change.`;
  return `${lead}${parts.join(" and ")} at ${where} in the days after this change (coincided with it; not proof it caused it).`;
}
