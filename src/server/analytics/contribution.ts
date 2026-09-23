import type { BaseMetrics, MetricKey } from "./metrics";

/**
 * Contribution of each child entity (e.g. campaign) to the change in a parent
 * metric between two periods.
 *
 * Additive metrics (spend, results, …): contribution_i = x_cur,i − x_prev,i.
 *
 * Ratio metrics R = N / D (CPR = spend/results, CTR = linkClicks/impressions, …):
 *   R_cur − R_prev = Σ_i [ (N_cur,i − N_prev,i) − R_prev · (D_cur,i − D_prev,i) ] / D_cur
 * This identity is exact (the terms sum to the total change), so shares are
 * mathematically attributable — which is NOT a causal claim.
 */

type Parts = { num: (m: BaseMetrics) => number; den: (m: BaseMetrics) => number; scale?: number };

const RATIO_PARTS: Partial<Record<MetricKey, Parts>> = {
  cpr: { num: (m) => m.spend, den: (m) => m.results },
  cpc: { num: (m) => m.spend, den: (m) => m.linkClicks },
  cpm: { num: (m) => m.spend, den: (m) => m.impressions, scale: 1000 },
  ctr: { num: (m) => m.linkClicks, den: (m) => m.impressions },
  cvr: { num: (m) => m.results, den: (m) => m.linkClicks },
  roas: { num: (m) => m.revenue ?? 0, den: (m) => m.spend },
};

const ADDITIVE: Partial<Record<MetricKey, (m: BaseMetrics) => number>> = {
  spend: (m) => m.spend,
  impressions: (m) => m.impressions,
  clicks: (m) => m.clicks,
  linkClicks: (m) => m.linkClicks,
  results: (m) => m.results,
  revenue: (m) => m.revenue ?? 0,
};

export type ChildPeriods = { id: string; name: string; current: BaseMetrics | null; previous: BaseMetrics | null };

export type Contribution = { id: string; name: string; contribution: number; share: number | null };

const zero: BaseMetrics = { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0, results: 0, revenue: 0 };

export function isContributionSupported(metric: MetricKey): boolean {
  return metric in RATIO_PARTS || metric in ADDITIVE;
}

/**
 * Returns per-child contributions sorted by absolute size (largest first).
 * `share` is contribution / total change (null when the total change is 0).
 */
export function contributions(
  metric: MetricKey,
  children: ChildPeriods[],
  totalCurrent: BaseMetrics,
  totalPrevious: BaseMetrics,
): Contribution[] {
  let items: { id: string; name: string; contribution: number }[];

  const add = ADDITIVE[metric];
  const ratio = RATIO_PARTS[metric];
  if (add) {
    items = children.map((c) => ({
      id: c.id,
      name: c.name,
      contribution: add(c.current ?? zero) - add(c.previous ?? zero),
    }));
  } else if (ratio) {
    const scale = ratio.scale ?? 1;
    const dCur = ratio.den(totalCurrent);
    const dPrev = ratio.den(totalPrevious);
    if (!dCur || !dPrev) return [];
    const rPrev = ratio.num(totalPrevious) / dPrev;
    items = children.map((c) => {
      const cur = c.current ?? zero;
      const prev = c.previous ?? zero;
      const dn = ratio.num(cur) - ratio.num(prev);
      const dd = ratio.den(cur) - ratio.den(prev);
      return { id: c.id, name: c.name, contribution: ((dn - rPrev * dd) / dCur) * scale };
    });
  } else {
    return [];
  }

  const total = items.reduce((s, i) => s + i.contribution, 0);
  return items
    .map((i) => ({ ...i, share: total ? i.contribution / total : null }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}
