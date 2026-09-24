import "server-only";
import { env } from "../env";
import { CachedWindsor } from "../cache/snapshots";
import type { DateRange } from "../analytics/date-ranges";
import type { BaseMetrics } from "../analytics/metrics";
import type { DataSource, WindsorRow, WindsorTransport } from "./client";
import { DemoWindsorTransport } from "./demo-transport";
import { ACTIVITY_FIELDS, F, WINDSOR_CONNECTOR } from "./fields";
import { McpWindsorTransport } from "./mcp-transport";

/**
 * The Windsor data abstraction. Application services call these functions;
 * UI components never import anything from `server/windsor`.
 *
 * Callers must pass account ids resolved server-side from MetaAccountMapping
 * for a client the user is authorised to see (see server/auth/access.ts).
 */

export type Grain = "account" | "campaign" | "adset" | "ad";

export type PerfQuery = {
  accountIds: string[];
  range: DateRange;
  grain: Grain;
  /** Split rows by day. */
  daily?: boolean;
  /** Windsor conversion field ids to return (e.g. the client's primary conversion). */
  conversionFields: string[];
  /** Windsor conversion value field ids. */
  valueFields: string[];
  attributionWindow: string;
  /** Ad grain only: creative text, rankings and video metrics. */
  includeCreative?: boolean;
  /** Ad set grain only: learning stage and optimization goal. */
  includeDelivery?: boolean;
  forceRefresh?: boolean;
};

export type CreativeInfo = {
  thumbnailUrl: string | null;
  destinationUrl: string | null;
  title: string | null;
  body: string | null;
  callToAction: string | null;
  qualityRanking: string | null;
  engagementRanking: string | null;
  conversionRanking: string | null;
  videoViews3s: number | null;
  videoP25: number | null;
  videoP100: number | null;
  thruplays: number | null;
};

export type PerfRow = {
  date?: string;
  accountId: string;
  accountName?: string;
  campaignId?: string;
  campaignName?: string;
  objective?: string;
  campaignStatus?: string;
  /** Major currency units (Windsor returns minor units; converted here). */
  campaignDailyBudget?: number | null;
  campaignLifetimeBudget?: number | null;
  adsetId?: string;
  adsetName?: string;
  adsetStatus?: string;
  adsetDailyBudget?: number | null;
  adsetLifetimeBudget?: number | null;
  adId?: string;
  adName?: string;
  adStatus?: string;
  creativeId?: string;
  creative?: CreativeInfo;
  learningStage?: string | null;
  optimizationGoal?: string | null;
  targeting?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number | null;
  actions: Record<string, number>;
  values: Record<string, number>;
};

export type DataMeta = {
  source: DataSource;
  fetchedAt: Date;
  fromCache: boolean;
  stale: boolean;
  /** True when the query covers recent days (still changing). Historical data doesn't age. */
  recent?: boolean;
};

/** A range ending within the last 2 days is still being updated by Meta. */
function isRecent(range: DateRange): boolean {
  const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  return range.to >= cutoff;
}

export type PerfResult = { rows: PerfRow[]; meta: DataMeta };

const GRAIN_FIELDS: Record<Grain, string[]> = {
  account: [F.accountId, F.accountName],
  campaign: [
    F.accountId,
    F.campaignId,
    F.campaignName,
    F.campaignObjective,
    F.campaignEffectiveStatus,
    F.campaignDailyBudget,
    F.campaignLifetimeBudget,
  ],
  adset: [
    F.accountId,
    F.campaignId,
    F.campaignName,
    F.adsetId,
    F.adsetName,
    F.adsetEffectiveStatus,
    F.adsetDailyBudget,
    F.adsetLifetimeBudget,
  ],
  ad: [
    F.accountId,
    F.campaignId,
    F.campaignName,
    F.adsetId,
    F.adsetName,
    F.adId,
    F.adName,
    F.adEffectiveStatus,
    F.creativeId,
  ],
};

const BASE_METRIC_FIELDS = [F.spend, F.impressions, F.clicks, F.linkClicks, F.reach];

const CREATIVE_FIELDS = [
  F.thumbnailUrl,
  F.destinationUrl,
  F.adTitle,
  F.adBody,
  F.callToAction,
  F.qualityRanking,
  F.engagementRanking,
  F.conversionRanking,
  F.videoViews3s,
  F.videoP25,
  F.videoP100,
  F.thruplays,
];

const DELIVERY_FIELDS = [F.adsetLearningStage, F.adsetOptimizationGoal, F.adsetTargeting];

let windsor: CachedWindsor | undefined;

function transport(): CachedWindsor {
  if (!windsor) {
    const e = env();
    const t: WindsorTransport =
      e.DATA_SOURCE === "windsor"
        ? new McpWindsorTransport(e.WINDSOR_MCP_URL, e.WINDSOR_API_KEY!)
        : new DemoWindsorTransport();
    windsor = new CachedWindsor(t);
  }
  return windsor;
}

/** The configured source, without throwing when the Windsor key is missing (UI labelling only). */
export function dataSource(): DataSource {
  try {
    return env().DATA_SOURCE;
  } catch {
    return "windsor";
  }
}

export async function getPerformance(q: PerfQuery): Promise<PerfResult> {
  const fields = uniq([
    ...(q.daily ? [F.date] : []),
    ...GRAIN_FIELDS[q.grain],
    ...(q.includeCreative && q.grain === "ad" ? CREATIVE_FIELDS : []),
    ...(q.includeDelivery && q.grain === "adset" ? DELIVERY_FIELDS : []),
    ...BASE_METRIC_FIELDS,
    ...q.conversionFields,
    ...q.valueFields,
  ]);

  const res = await transport().getData(
    {
      connector: WINDSOR_CONNECTOR,
      accounts: uniq(q.accountIds),
      fields,
      dateFrom: q.range.from,
      dateTo: q.range.to,
      options: q.attributionWindow && q.attributionWindow !== "default" ? { attribution_window: q.attributionWindow } : undefined,
    },
    { forceRefresh: q.forceRefresh },
  );

  return {
    rows: normalizeRows(res.rows, q, {
      creative: !!q.includeCreative && q.grain === "ad",
      delivery: !!q.includeDelivery && q.grain === "adset",
    }),
    meta: { source: res.source, fetchedAt: res.fetchedAt, fromCache: res.fromCache, stale: !!res.stale, recent: isRecent(q.range) },
  };
}

/**
 * Meta change history for ONE ad account (activity fields cannot be combined
 * with account_id, so each account is queried separately and attributed here).
 */
export async function getAccountActivity(
  accountId: string,
  range: DateRange,
  opts: { forceRefresh?: boolean } = {},
): Promise<{ rows: WindsorRow[]; meta: DataMeta }> {
  const res = await transport().getData(
    {
      connector: WINDSOR_CONNECTOR,
      accounts: [accountId],
      fields: [...ACTIVITY_FIELDS],
      dateFrom: range.from,
      dateTo: range.to,
      options: { activities_add_children: true },
    },
    opts,
  );
  return { rows: res.rows, meta: { source: res.source, fetchedAt: res.fetchedAt, fromCache: res.fromCache, stale: !!res.stale, recent: true } };
}

/** Convenience wrappers matching the brief's service vocabulary. */
export const getAccountPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "account" });
export const getCampaignPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "campaign" });
export const getAdSetPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "adset" });
export const getAdPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "ad" });
export const getPerformanceTrend = (q: Omit<PerfQuery, "grain" | "daily">) =>
  getPerformance({ ...q, grain: "account", daily: true });

// ---------------------------------------------------------------------------

export function normalizeRows(
  raw: WindsorRow[],
  q: Pick<PerfQuery, "accountIds" | "conversionFields" | "valueFields">,
  extra: { creative?: boolean; delivery?: boolean } = {},
): PerfRow[] {
  const allowed = new Set(q.accountIds);
  const out: PerfRow[] = [];
  for (const r of raw) {
    const accountId = str(r[F.accountId]);
    // Defence in depth: never let a row from an unmapped account through.
    if (!accountId || !allowed.has(accountId)) {
      console.warn("[windsor] dropped row for unexpected account", accountId);
      continue;
    }
    const actions: Record<string, number> = {};
    for (const f of q.conversionFields) actions[f] = num(r[f]);
    const values: Record<string, number> = {};
    for (const f of q.valueFields) values[f] = num(r[f]);

    out.push({
      date: str(r[F.date]),
      accountId,
      accountName: str(r[F.accountName]),
      campaignId: str(r[F.campaignId]),
      campaignName: str(r[F.campaignName]),
      objective: str(r[F.campaignObjective]),
      campaignStatus: str(r[F.campaignEffectiveStatus]),
      campaignDailyBudget: minorToMajor(r[F.campaignDailyBudget]),
      campaignLifetimeBudget: minorToMajor(r[F.campaignLifetimeBudget]),
      adsetId: str(r[F.adsetId]),
      adsetName: str(r[F.adsetName]),
      adsetStatus: str(r[F.adsetEffectiveStatus]),
      adsetDailyBudget: minorToMajor(r[F.adsetDailyBudget]),
      adsetLifetimeBudget: minorToMajor(r[F.adsetLifetimeBudget]),
      adId: str(r[F.adId]),
      adName: str(r[F.adName]),
      adStatus: str(r[F.adEffectiveStatus]),
      creativeId: str(r[F.creativeId]),
      ...(extra.creative
        ? {
            creative: {
              thumbnailUrl: str(r[F.thumbnailUrl]) ?? null,
              destinationUrl: str(r[F.destinationUrl]) ?? null,
              title: str(r[F.adTitle]) ?? null,
              body: str(r[F.adBody]) ?? null,
              callToAction: str(r[F.callToAction]) ?? null,
              qualityRanking: str(r[F.qualityRanking]) ?? null,
              engagementRanking: str(r[F.engagementRanking]) ?? null,
              conversionRanking: str(r[F.conversionRanking]) ?? null,
              videoViews3s: optNum(r[F.videoViews3s]),
              videoP25: optNum(r[F.videoP25]),
              videoP100: optNum(r[F.videoP100]),
              thruplays: optNum(r[F.thruplays]),
            },
          }
        : {}),
      ...(extra.delivery
        ? {
            learningStage: str(r[F.adsetLearningStage]) ?? null,
            optimizationGoal: str(r[F.adsetOptimizationGoal]) ?? null,
            targeting: str(r[F.adsetTargeting]) ?? null,
          }
        : {}),
      spend: num(r[F.spend]),
      impressions: num(r[F.impressions]),
      clicks: num(r[F.clicks]),
      linkClicks: num(r[F.linkClicks]),
      reach: r[F.reach] == null ? null : num(r[F.reach]),
      actions,
      values,
    });
  }
  return out;
}

/** Project a row onto the base metrics for a client's chosen conversion fields. */
export function toBase(row: PerfRow, conversionField: string, valueField: string | null): BaseMetrics {
  return {
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    reach: row.reach,
    results: row.actions[conversionField] ?? 0,
    revenue: valueField ? (row.values[valueField] ?? 0) : null,
  };
}

export function mergeMeta(metas: DataMeta[]): DataMeta {
  if (!metas.length) return { source: dataSource(), fetchedAt: new Date(), fromCache: false, stale: false };
  // "Last updated" = the oldest fetch among queries whose data is still changing.
  // Comparison periods (fully in the past) don't change, so their fetch time is irrelevant.
  const live = metas.filter((m) => m.recent !== false);
  const basis = live.length ? live : metas;
  return {
    source: metas[0].source,
    fetchedAt: new Date(Math.min(...basis.map((m) => m.fetchedAt.getTime()))),
    recent: live.length > 0,
    fromCache: metas.some((m) => m.fromCache),
    stale: metas.some((m) => m.stale),
  };
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function str(v: unknown): string | undefined {
  return v == null || v === "" ? undefined : String(v);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function optNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Meta budgets are in minor units (cents); 0 means "not set". */
function minorToMajor(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / 100 : null;
}
