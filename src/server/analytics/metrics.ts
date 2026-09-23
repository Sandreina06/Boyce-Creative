/**
 * Metric definitions and derivation.
 *
 * Ratios are always recomputed from base counts — never averaged or summed —
 * so totals are correct at every level of aggregation.
 *
 * Click-based ratios use LINK clicks (Meta's "CTR (link click-through rate)"),
 * which gives the exact identity used by root-cause analysis:
 *   cost per result = (CPM / 1000) / (CTR × CVR)
 */

export type BaseMetrics = {
  spend: number;
  impressions: number;
  clicks: number; // all clicks
  linkClicks: number;
  /** Reach is non-additive; null when it cannot be known for this aggregate. */
  reach: number | null;
  results: number;
  /** Conversion value; null when the client has no value field configured. */
  revenue: number | null;
};

export const emptyBase = (): BaseMetrics => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: 0,
  reach: 0,
  results: 0,
  revenue: null,
});

/** Sum additive metrics. Reach becomes null unless `keepReach` (entities known to be disjoint). */
export function sumBase(items: BaseMetrics[], opts: { keepReach?: boolean } = {}): BaseMetrics {
  const out = emptyBase();
  let reach: number | null = 0;
  for (const m of items) {
    out.spend += m.spend;
    out.impressions += m.impressions;
    out.clicks += m.clicks;
    out.linkClicks += m.linkClicks;
    out.results += m.results;
    if (m.revenue != null) out.revenue = (out.revenue ?? 0) + m.revenue;
    reach = reach == null || m.reach == null ? null : reach + m.reach;
  }
  out.reach = opts.keepReach ? reach : null;
  return out;
}

export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "frequency"
  | "clicks"
  | "linkClicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "results"
  | "cpr"
  | "cvr"
  | "revenue"
  | "roas";

export type Derived = Record<MetricKey, number | null>;

export const safeDiv = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

export function derive(m: BaseMetrics): Derived {
  return {
    spend: m.spend,
    impressions: m.impressions,
    reach: m.reach,
    frequency: safeDiv(m.impressions, m.reach),
    clicks: m.clicks,
    linkClicks: m.linkClicks,
    ctr: safeDiv(m.linkClicks, m.impressions),
    cpc: safeDiv(m.spend, m.linkClicks),
    cpm: m.impressions ? (m.spend / m.impressions) * 1000 : null,
    results: m.results,
    cpr: safeDiv(m.spend, m.results),
    cvr: safeDiv(m.results, m.linkClicks),
    revenue: m.revenue,
    roas: safeDiv(m.revenue, m.spend),
  };
}

export type MetricFormat = "currency" | "integer" | "percent" | "decimal" | "multiplier";
export type Direction = "lower_better" | "higher_better" | "neutral";

export type MetricDef = {
  key: MetricKey;
  label: string;
  short: string;
  format: MetricFormat;
  direction: Direction;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  spend: { key: "spend", label: "Spend", short: "Spend", format: "currency", direction: "neutral" },
  impressions: { key: "impressions", label: "Impressions", short: "Impr.", format: "integer", direction: "neutral" },
  reach: { key: "reach", label: "Reach", short: "Reach", format: "integer", direction: "neutral" },
  frequency: { key: "frequency", label: "Frequency", short: "Freq.", format: "decimal", direction: "neutral" },
  clicks: { key: "clicks", label: "Clicks (all)", short: "Clicks", format: "integer", direction: "neutral" },
  linkClicks: { key: "linkClicks", label: "Link clicks", short: "Link clicks", format: "integer", direction: "higher_better" },
  ctr: { key: "ctr", label: "CTR (link)", short: "CTR", format: "percent", direction: "higher_better" },
  cpc: { key: "cpc", label: "CPC (link)", short: "CPC", format: "currency", direction: "lower_better" },
  cpm: { key: "cpm", label: "CPM", short: "CPM", format: "currency", direction: "lower_better" },
  results: { key: "results", label: "Results", short: "Results", format: "integer", direction: "higher_better" },
  cpr: { key: "cpr", label: "Cost per result", short: "CPR", format: "currency", direction: "lower_better" },
  cvr: { key: "cvr", label: "CVR (link click → result)", short: "CVR", format: "percent", direction: "higher_better" },
  revenue: { key: "revenue", label: "Revenue", short: "Revenue", format: "currency", direction: "higher_better" },
  roas: { key: "roas", label: "ROAS", short: "ROAS", format: "multiplier", direction: "higher_better" },
};

/** Map a client KPI name (settings) to the metric that measures it. */
export function kpiToMetric(kpi: string): MetricKey {
  switch (kpi.toUpperCase()) {
    case "CPL":
    case "CPA":
    case "COST_PER_RESULT":
    case "COST_PER_APPOINTMENT":
      return "cpr";
    case "ROAS":
      return "roas";
    case "CTR":
      return "ctr";
    case "CPC":
      return "cpc";
    case "CPM":
      return "cpm";
    case "CVR":
      return "cvr";
    case "RESULTS":
      return "results";
    case "REVENUE":
      return "revenue";
    default:
      return "cpr";
  }
}

export const KPI_OPTIONS = [
  { id: "CPL", label: "CPL — cost per lead" },
  { id: "CPA", label: "CPA — cost per acquisition" },
  { id: "COST_PER_APPOINTMENT", label: "Cost per appointment" },
  { id: "COST_PER_RESULT", label: "Cost per result" },
  { id: "ROAS", label: "ROAS" },
  { id: "CTR", label: "CTR" },
  { id: "CPC", label: "CPC" },
  { id: "CPM", label: "CPM" },
  { id: "CVR", label: "CVR" },
] as const;

/** Label for the cost-per-result metric given the client's KPI naming. */
export function costPerResultLabel(primaryKpi: string, resultLabel: string): string {
  switch (primaryKpi.toUpperCase()) {
    case "CPL":
      return "CPL";
    case "CPA":
      return "CPA";
    case "COST_PER_APPOINTMENT":
      return "Cost / appointment";
    default:
      return `Cost / ${resultLabel.toLowerCase().replace(/s$/, "")}`;
  }
}
