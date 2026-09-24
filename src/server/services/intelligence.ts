import "server-only";
import type { ClientContext } from "../auth/access";
import { benchmarkFor, type Benchmark } from "../analytics/benchmarks";
import { groupBy, type CopyGroup } from "../analytics/copy";
import { assessCreative, DEFAULT_CREATIVE_RULES, type CreativeAssessment } from "../analytics/creative";
import { COMPARE_MODES, daysBetweenInclusive, type ResolvedDates } from "../analytics/date-ranges";
import { evaluateHealth, type Issue } from "../analytics/health";
import { derive, kpiToMetric, sumBase, type BaseMetrics } from "../analytics/metrics";
import { evaluateStrategy, type StrategyIssue } from "../analytics/strategy";
import { formatMetric } from "@/lib/format";
import { mergeMeta, toBase, type CreativeInfo, type DataMeta, type PerfRow } from "../windsor/service";
import { fetchGrain, getClientPacing, metricLabel } from "./client-data";

/**
 * Creative analysis, account health and context-aware strategy for one client.
 * All inputs come from Windsor (via fetchGrain) for the client's mapped
 * accounts; all logic is deterministic (src/server/analytics/*).
 */

const LPV_FIELD = "actions_landing_page_view"; // verified Windsor field

export type CreativeRow = CreativeAssessment & {
  name: string;
  campaignName: string;
  adsetName: string;
  status: string | null;
  creative: CreativeInfo | null;
};

export type ClientIntelligence = {
  creatives: CreativeRow[];
  counts: Record<CreativeAssessment["label"], number>;
  primaryTexts: CopyGroup[];
  headlines: CopyGroup[];
  destinations: CopyGroup[];
  issues: (Issue | StrategyIssue)[];
  benchmark: Benchmark;
  meta: DataMeta;
};

export async function getClientIntelligence(ctx: ClientContext, dates: ResolvedDates): Promise<ClientIntelligence> {
  const s = ctx.settings;
  const cur = s.currency;
  const fmt = {
    money: (v: number | null) => formatMetric("spend", v, cur),
    pct: (v: number | null) => formatMetric("ctr", v, cur),
  };
  const baseOf = (r: PerfRow): BaseMetrics => toBase(r, s.primaryConversionField, s.primaryValueField);

  const [adsCur, adsPrev, campCur, campPrev, adsets, daily, pacing, acct] = await Promise.all([
    fetchGrain(ctx, "ad", dates.range, false, { includeCreative: true, extraConversionFields: [LPV_FIELD] }),
    dates.comparison ? fetchGrain(ctx, "ad", dates.comparison) : null,
    fetchGrain(ctx, "campaign", dates.range),
    dates.comparison ? fetchGrain(ctx, "campaign", dates.comparison) : null,
    fetchGrain(ctx, "adset", dates.range, false, { includeDelivery: true }),
    fetchGrain(ctx, "account", dates.range, true),
    getClientPacing(ctx),
    fetchGrain(ctx, "account", dates.range),
  ]);

  // ---- Creative assessments ----------------------------------------------------
  const prevByAd = new Map((adsPrev?.rows ?? []).map((r) => [r.adId!, baseOf(r)]));
  const total = sumBase(adsCur.rows.map(baseOf));
  const efficiency = kpiToMetric(s.primaryKpi) === "roas" ? "roas" : "cpr";
  const baseline = { current: derive(total), efficiency } as const;
  const resultLabel = s.primaryConversionLabel;

  const creatives: CreativeRow[] = adsCur.rows
    .filter((r) => r.spend > 0)
    .map((r) => ({
      ...assessCreative(
        { id: r.adId!, status: r.adStatus ?? null, current: baseOf(r), previous: prevByAd.get(r.adId!) ?? null },
        baseline,
        total.spend,
        fmt,
        resultLabel,
        DEFAULT_CREATIVE_RULES,
      ),
      name: r.adName ?? r.adId!,
      campaignName: r.campaignName ?? "",
      adsetName: r.adsetName ?? "",
      status: r.adStatus ?? null,
      creative: r.creative ?? null,
    }))
    .sort((a, b) => (b.current.spend ?? 0) - (a.current.spend ?? 0));

  const counts = { winner: 0, scaling_candidate: 0, fatigue: 0, underperformer: 0, stable: 0, low_data: 0 };
  for (const c of creatives) counts[c.label]++;

  // ---- Copy & destinations -------------------------------------------------------
  const delivered = adsCur.rows.filter((r) => r.spend > 0);
  const primaryTexts = groupBy(delivered, (r) => r.creative?.body, baseOf);
  const headlines = groupBy(delivered, (r) => r.creative?.title, baseOf);
  const destinations = groupBy(delivered, (r) => r.creative?.destinationUrl ?? "(none)", baseOf, 0);

  // ---- Health (structure, delivery, tracking, pacing, KPI drivers) --------------------
  const adsByAdset = new Map<string, { id: string; name: string; spend: number }[]>();
  for (const r of delivered) {
    if (r.adStatus !== "ACTIVE") continue;
    const list = adsByAdset.get(r.adsetId!) ?? [];
    list.push({ id: r.adId!, name: r.adName ?? r.adId!, spend: r.spend });
    adsByAdset.set(r.adsetId!, list);
  }
  const prevCampaign = new Map((campPrev?.rows ?? []).map((r) => [r.campaignId!, baseOf(r)]));
  const campaignTotalsPrev = campPrev ? sumBase(campPrev.rows.map(baseOf)) : null;
  const primaryKey = kpiToMetric(s.primaryKpi);
  const completeDays = daily.rows
    .filter((r) => r.date! < dates.today)
    .reduce((m, r) => {
      const d = m.get(r.date!) ?? { date: r.date!, spend: 0, results: 0 };
      d.spend += r.spend;
      d.results += baseOf(r).results;
      return m.set(r.date!, d);
    }, new Map<string, { date: string; spend: number; results: number }>());

  const health = evaluateHealth({
    resultLabel,
    primaryKpiLabel: metricLabel(ctx, primaryKey === "roas" ? "roas" : "cpr"),
    efficiency,
    // Account grain keeps true reach (not additive across campaigns); valid for a single ad account.
    current: sumBase(acct.rows.map(baseOf), { keepReach: ctx.accountIds.length === 1 }),
    previous: campaignTotalsPrev,
    comparisonLabel: COMPARE_MODES.find((m) => m.id === dates.compare)?.label.toLowerCase() ?? "previous period",
    rangeDays: daysBetweenInclusive(dates.range),
    campaigns: campCur.rows.map((r) => ({
      id: r.campaignId!,
      name: r.campaignName ?? r.campaignId!,
      status: r.campaignStatus ?? null,
      current: baseOf(r),
      previous: prevCampaign.get(r.campaignId!) ?? null,
    })),
    adsets: adsets.rows.map((r) => ({
      id: r.adsetId!,
      name: r.adsetName ?? r.adsetId!,
      campaignName: r.campaignName ?? "",
      status: r.adsetStatus ?? null,
      learningStage: r.learningStage ?? null,
      current: baseOf(r),
      ads: adsByAdset.get(r.adsetId!) ?? [],
    })),
    creatives,
    daily: [...completeDays.values()].sort((a, b) => a.date.localeCompare(b.date)),
    pacing,
    fmt,
  });

  // ---- Strategy (context + benchmarks) ---------------------------------------------
  const lpv = delivered.reduce((sum, r) => sum + (r.actions[LPV_FIELD] ?? 0), 0);
  const isVideo = (r: PerfRow) => r.creative?.videoViews3s != null;
  const belowAvg = (v: string | null | undefined) => !!v && v.startsWith("BELOW_AVERAGE");
  const strategy = evaluateStrategy({
    clientName: ctx.client.name,
    industry: s.industry,
    leadMethod: s.leadMethod,
    serviceArea: s.serviceArea,
    resultLabel,
    efficiency,
    current: derive(total),
    totalResults: total.results,
    primaryTexts,
    headlines,
    destinations,
    formats: { video: delivered.filter(isVideo).length, static: delivered.filter((r) => !isVideo(r)).length },
    belowAvgConversionRanking: delivered
      .filter((r) => belowAvg(r.creative?.conversionRanking) && r.spend >= 20)
      .map((r) => ({ name: r.adName ?? r.adId!, spend: r.spend })),
    belowAvgQualityRanking: delivered
      .filter((r) => belowAvg(r.creative?.qualityRanking) && r.spend >= 20)
      .map((r) => ({ name: r.adName ?? r.adId!, spend: r.spend })),
    landingPageViews: lpv || null,
    fmt,
  });

  const order = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const issues = [...health, ...strategy].sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    creatives,
    counts,
    primaryTexts,
    headlines,
    destinations,
    issues,
    benchmark: benchmarkFor(s.industry),
    meta: mergeMeta([adsCur.meta, acct.meta, campCur.meta, adsets.meta, daily.meta, pacing.meta, ...(adsPrev ? [adsPrev.meta] : []), ...(campPrev ? [campPrev.meta] : [])]),
  };
}

