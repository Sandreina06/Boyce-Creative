import type { ClientContext } from "../auth/access";
import type { MetricKey } from "../analytics/metrics";
import { metricLabel } from "./client-data";

/** Table columns per level, following the brief; revenue/ROAS only when the client tracks value. */
export function columnsFor(ctx: ClientContext, grain: "campaign" | "adset" | "ad"): { key: MetricKey; label: string }[] {
  const hasValue = !!ctx.settings.primaryValueField;
  const base: MetricKey[] =
    grain === "ad"
      ? ["spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm", "results", "cpr"]
      : ["spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm", "results", "cpr", "cvr"];
  const keys: MetricKey[] = hasValue ? [...base, "revenue", "roas"] : base;
  return keys.map((k) => ({ key: k, label: k === "results" ? ctx.settings.primaryConversionLabel : k === "cpr" ? metricLabel(ctx, "cpr") : shortLabel(k) }));
}

function shortLabel(k: MetricKey): string {
  return (
    { spend: "Spend", impressions: "Impr.", reach: "Reach", frequency: "Freq.", clicks: "Clicks", ctr: "CTR", cpc: "CPC", cpm: "CPM", cvr: "CVR", revenue: "Revenue", roas: "ROAS" } as Record<string, string>
  )[k] ?? k;
}
