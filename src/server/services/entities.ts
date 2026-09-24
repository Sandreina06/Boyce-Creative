import "server-only";
import type { ClientContext } from "../auth/access";
import { compareValues, type Comparison } from "../analytics/compare";
import { assessCreative, CREATIVE_LABEL_TEXT } from "../analytics/creative";
import type { ResolvedDates } from "../analytics/date-ranges";
import { derive, kpiToMetric, METRICS, sumBase, type BaseMetrics, type Derived, type MetricKey } from "../analytics/metrics";
import { summarizeTargeting, type TargetingSummary } from "../analytics/targeting";
import { formatMetric } from "@/lib/format";
import { mergeMeta, toBase, type DataMeta, type Grain, type PerfRow } from "../windsor/service";
import { fetchGrain } from "./client-data";

/**
 * Rows for the Campaigns / Ad sets / Ads tables and their drilldowns.
 * Filtering by parent happens after the (client-scoped) Windsor query.
 */

export type EntityGrain = Extract<Grain, "campaign" | "adset" | "ad">;

export type Flag = { label: string; tone: "critical" | "warning" | "good" | "info" };

export type EntityRow = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  status: string | null;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  learningStage: string | null;
  optimizationGoal: string | null;
  targeting: TargetingSummary | null;
  current: Derived;
  previous: Derived | null;
  changes: Partial<Record<MetricKey, Comparison>>;
  spendShare: number;
  flags: Flag[];
};

export type EntityTable = {
  grain: EntityGrain;
  rows: EntityRow[];
  totals: { current: Derived; previous: Derived | null };
  meta: DataMeta;
};

const COMPARED: MetricKey[] = ["spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm", "results", "cpr", "cvr", "revenue", "roas"];

export async function getEntityTable(
  ctx: ClientContext,
  dates: ResolvedDates,
  grain: EntityGrain,
  filter: { campaignId?: string | null; adsetId?: string | null } = {},
): Promise<EntityTable> {
  const s = ctx.settings;
  const baseOf = (r: PerfRow): BaseMetrics => toBase(r, s.primaryConversionField, s.primaryValueField);
  const extra = grain === "adset" ? { includeDelivery: true } : grain === "ad" ? { includeCreative: true } : {};
  const [cur, prev] = await Promise.all([
    fetchGrain(ctx, grain, dates.range, false, extra),
    dates.comparison ? fetchGrain(ctx, grain, dates.comparison) : null,
  ]);

  const idOf = (r: PerfRow) => (grain === "campaign" ? r.campaignId : grain === "adset" ? r.adsetId : r.adId) ?? "";
  const keep = (r: PerfRow) =>
    (!filter.campaignId || r.campaignId === filter.campaignId) && (!filter.adsetId || r.adsetId === filter.adsetId);

  const curRows = cur.rows.filter(keep);
  const prevById = new Map((prev?.rows ?? []).filter(keep).map((r) => [idOf(r), baseOf(r)]));
  const totalCur = sumBase(curRows.map(baseOf));
  const totalPrevBase = prev ? sumBase((prev.rows ?? []).filter(keep).map(baseOf)) : null;
  const acc = derive(totalCur);
  const primary = kpiToMetric(s.primaryKpi);
  const fmt = { money: (v: number | null) => formatMetric("spend", v, s.currency), pct: (v: number | null) => formatMetric("ctr", v, s.currency) };

  const rows: EntityRow[] = curRows.map((r) => {
    const base = baseOf(r);
    const c = derive(base);
    const pb = prevById.get(idOf(r)) ?? null;
    const p = pb ? derive(pb) : null;
    const changes: EntityRow["changes"] = {};
    for (const k of COMPARED) changes[k] = compareValues(c[k], p ? p[k] : null, METRICS[k].direction);

    const flags: Flag[] = [];
    if (r.learningStage === "FAIL") flags.push({ label: "Learning limited", tone: "warning" });
    else if (r.learningStage === "LEARNING") flags.push({ label: "Learning", tone: "info" });
    if (base.results === 0 && acc.cpr && base.spend >= acc.cpr * 1.5) flags.push({ label: "Spend, no results", tone: "critical" });
    else if (primary !== "roas" && acc.cpr && c.cpr && base.results >= 2 && c.cpr >= acc.cpr * 1.5) flags.push({ label: "High cost/result", tone: "warning" });
    if ((c.frequency ?? 0) >= 3.5) flags.push({ label: `Frequency ${c.frequency!.toFixed(1)}`, tone: "warning" });
    if (acc.ctr && c.ctr != null && base.impressions >= 2000 && c.ctr < acc.ctr * 0.6) flags.push({ label: "Low CTR", tone: "warning" });
    if (grain === "ad") {
      const a = assessCreative(
        { id: idOf(r), status: r.adStatus ?? null, current: base, previous: pb },
        { current: acc, efficiency: primary === "roas" ? "roas" : "cpr" },
        totalCur.spend,
        fmt,
        s.primaryConversionLabel,
      );
      if (a.label !== "stable" && a.label !== "low_data") {
        const tone = a.label === "winner" ? "good" : a.label === "scaling_candidate" ? "info" : a.label === "fatigue" ? "warning" : "critical";
        if (!flags.some((f) => f.label === "Spend, no results" && a.label === "underperformer")) flags.unshift({ label: CREATIVE_LABEL_TEXT[a.label], tone });
      }
      if (r.creative?.conversionRanking?.startsWith("BELOW")) flags.push({ label: "Conversion rank below avg", tone: "warning" });
    }

    return {
      id: idOf(r),
      name: (grain === "campaign" ? r.campaignName : grain === "adset" ? r.adsetName : r.adName) ?? idOf(r),
      campaignId: r.campaignId ?? null,
      campaignName: r.campaignName ?? null,
      adsetId: r.adsetId ?? null,
      adsetName: r.adsetName ?? null,
      status: (grain === "campaign" ? r.campaignStatus : grain === "adset" ? r.adsetStatus : r.adStatus) ?? null,
      objective: r.objective ?? null,
      dailyBudget: (grain === "campaign" ? r.campaignDailyBudget : r.adsetDailyBudget) ?? null,
      lifetimeBudget: (grain === "campaign" ? r.campaignLifetimeBudget : r.adsetLifetimeBudget) ?? null,
      learningStage: r.learningStage ?? null,
      optimizationGoal: r.optimizationGoal ?? null,
      targeting: summarizeTargeting(r.targeting),
      current: c,
      previous: p,
      changes,
      spendShare: totalCur.spend ? base.spend / totalCur.spend : 0,
      flags,
    };
  });

  rows.sort((a, b) => (b.current.spend ?? 0) - (a.current.spend ?? 0));
  return {
    grain,
    rows,
    totals: { current: acc, previous: totalPrevBase ? derive(totalPrevBase) : null },
    meta: mergeMeta([cur.meta, ...(prev ? [prev.meta] : [])]),
  };
}

/** Daily trend for one campaign or ad set. */
export async function getEntityTrend(ctx: ClientContext, dates: ResolvedDates, grain: "campaign" | "adset", id: string) {
  const res = await fetchGrain(ctx, grain, dates.range, true);
  const byDate = new Map<string, BaseMetrics[]>();
  for (const r of res.rows) {
    if ((grain === "campaign" ? r.campaignId : r.adsetId) !== id || !r.date) continue;
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), toBase(r, ctx.settings.primaryConversionField, ctx.settings.primaryValueField)]);
  }
  const trend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ms]) => {
      const d = derive(sumBase(ms));
      return { date, spend: d.spend ?? 0, results: d.results ?? 0, cpr: d.cpr };
    });
  return { trend, meta: res.meta };
}
