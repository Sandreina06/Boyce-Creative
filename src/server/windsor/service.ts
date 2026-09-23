import "server-only";
import { env } from "../env";
import { CachedWindsor } from "../cache/snapshots";
import type { DateRange } from "../analytics/date-ranges";
import type { BaseMetrics } from "../analytics/metrics";
import type { DataSource, WindsorRow, WindsorTransport } from "./client";
import { DemoWindsorTransport } from "./demo-transport";
import { F, WINDSOR_CONNECTOR } from "./fields";
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
  forceRefresh?: boolean;
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
};

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

export function dataSource(): DataSource {
  return env().DATA_SOURCE;
}

export async function getPerformance(q: PerfQuery): Promise<PerfResult> {
  const fields = uniq([
    ...(q.daily ? [F.date] : []),
    ...GRAIN_FIELDS[q.grain],
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
    rows: normalizeRows(res.rows, q),
    meta: { source: res.source, fetchedAt: res.fetchedAt, fromCache: res.fromCache, stale: !!res.stale },
  };
}

/** Convenience wrappers matching the brief's service vocabulary. */
export const getAccountPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "account" });
export const getCampaignPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "campaign" });
export const getAdSetPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "adset" });
export const getAdPerformance = (q: Omit<PerfQuery, "grain">) => getPerformance({ ...q, grain: "ad" });
export const getPerformanceTrend = (q: Omit<PerfQuery, "grain" | "daily">) =>
  getPerformance({ ...q, grain: "account", daily: true });

// ---------------------------------------------------------------------------

export function normalizeRows(raw: WindsorRow[], q: Pick<PerfQuery, "accountIds" | "conversionFields" | "valueFields">): PerfRow[] {
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
  return {
    source: metas[0].source,
    // The oldest fetch time is the honest "last updated" for a page.
    fetchedAt: new Date(Math.min(...metas.map((m) => m.fetchedAt.getTime()))),
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

/** Meta budgets are in minor units (cents); 0 means "not set". */
function minorToMajor(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / 100 : null;
}
