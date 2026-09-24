import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { ClientContext } from "../auth/access";
import { db, schema } from "../db";
import { compareValues, type Comparison } from "../analytics/compare";
import { contributions, isContributionSupported, type Contribution } from "../analytics/contribution";
import {
  addDays,
  dayFractionIn,
  daysInMonth,
  startOfMonth,
  todayIn,
  type DateRange,
  type ResolvedDates,
} from "../analytics/date-ranges";
import {
  costPerResultLabel,
  derive,
  kpiToMetric,
  METRICS,
  sumBase,
  type BaseMetrics,
  type Derived,
  type MetricKey,
} from "../analytics/metrics";
import { computePacing, type Pacing } from "../analytics/pacing";
import { getPerformance, mergeMeta, toBase, type DataMeta, type Grain, type PerfRow } from "../windsor/service";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function conversionFieldsFor(ctx: ClientContext) {
  return {
    conversionFields: [ctx.settings.primaryConversionField],
    valueFields: ctx.settings.primaryValueField ? [ctx.settings.primaryValueField] : [],
  };
}

function baseOf(ctx: ClientContext, row: PerfRow): BaseMetrics {
  return toBase(row, ctx.settings.primaryConversionField, ctx.settings.primaryValueField);
}

export async function fetchGrain(
  ctx: ClientContext,
  grain: Grain,
  range: DateRange,
  daily = false,
  extra: { includeCreative?: boolean; includeDelivery?: boolean; extraConversionFields?: string[] } = {},
) {
  const conv = conversionFieldsFor(ctx);
  return getPerformance({
    accountIds: ctx.accountIds,
    range,
    grain,
    daily,
    attributionWindow: ctx.settings.attributionWindow,
    includeCreative: extra.includeCreative,
    includeDelivery: extra.includeDelivery,
    conversionFields: [...new Set([...conv.conversionFields, ...(extra.extraConversionFields ?? [])])],
    valueFields: conv.valueFields,
  });
}

export async function getAgencySettings() {
  const [row] = await db().select().from(schema.agencySettings).where(eq(schema.agencySettings.id, 1)).limit(1);
  return (
    row ?? {
      id: 1,
      agencyName: "Boyce Creative",
      businessPortfolioId: null,
      pacingThresholds: { onTrackPct: 10, criticalPct: 25 },
      attentionThresholds: { kpiChangeWarnPct: 20, kpiChangeCriticalPct: 35, ctrDropWarnPct: 20, minSpend: 50 },
      updatedAt: new Date(),
    }
  );
}

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

export type KpiCard = {
  key: MetricKey;
  label: string;
  format: (typeof METRICS)[MetricKey]["format"];
  comparison: Comparison;
  target: { value: number; direction: "lower_better" | "higher_better"; met: boolean } | null;
  /** The campaign contributing most to the change — the "so what". */
  topContributor: (Contribution & { unit: "abs" }) | null;
  isPrimary: boolean;
};

export function kpiKeysFor(ctx: ClientContext): MetricKey[] {
  const primary = kpiToMetric(ctx.settings.primaryKpi);
  const hasValue = !!ctx.settings.primaryValueField;
  const keys: MetricKey[] = ["spend", "results", "cpr"];
  if (hasValue) keys.push("revenue", "roas");
  if (!keys.includes(primary)) keys.push(primary);
  for (const k of ctx.settings.secondaryKpis) {
    const m = kpiToMetric(k);
    if (!keys.includes(m)) keys.push(m);
  }
  return keys;
}

export function metricLabel(ctx: ClientContext, key: MetricKey): string {
  if (key === "results") return ctx.settings.primaryConversionLabel;
  if (key === "cpr") return costPerResultLabel(ctx.settings.primaryKpi, ctx.settings.primaryConversionLabel);
  return METRICS[key].label;
}

// ---------------------------------------------------------------------------
// Client overview
// ---------------------------------------------------------------------------

export type CampaignSummary = {
  id: string;
  name: string;
  status: string | null;
  objective: string | null;
  current: Derived;
  cprChange: Comparison;
  spendShare: number;
};

export type TrendPoint = { date: string; spend: number; results: number; cpr: number | null; revenue: number | null };

export type ClientOverview = {
  kpis: KpiCard[];
  totals: { current: Derived; previous: Derived | null };
  trend: TrendPoint[];
  campaigns: CampaignSummary[];
  activeCampaigns: number;
  meta: DataMeta;
};

export async function getClientOverview(ctx: ClientContext, dates: ResolvedDates): Promise<ClientOverview> {
  const [curCampaigns, prevCampaigns, trendRes, targets] = await Promise.all([
    fetchGrain(ctx, "campaign", dates.range),
    dates.comparison ? fetchGrain(ctx, "campaign", dates.comparison) : null,
    fetchGrain(ctx, "account", dates.range, true),
    db().select().from(schema.clientTargets).where(eq(schema.clientTargets.clientId, ctx.client.id)),
  ]);

  // Account-grain totals give correct reach; campaign rows give contributions.
  const [curAccount, prevAccount] = await Promise.all([
    fetchGrain(ctx, "account", dates.range),
    dates.comparison ? fetchGrain(ctx, "account", dates.comparison) : null,
  ]);

  const singleAccount = ctx.accountIds.length === 1;
  const totalCur = sumBase(curAccount.rows.map((r) => baseOf(ctx, r)), { keepReach: singleAccount });
  const totalPrev = prevAccount
    ? sumBase(prevAccount.rows.map((r) => baseOf(ctx, r)), { keepReach: singleAccount })
    : null;
  const dCur = derive(totalCur);
  const dPrev = totalPrev ? derive(totalPrev) : null;

  // Per-campaign current/previous
  const byCampaign = new Map<string, { name: string; status: string | null; objective: string | null; cur: BaseMetrics | null; prev: BaseMetrics | null }>();
  for (const r of curCampaigns.rows) {
    byCampaign.set(r.campaignId!, {
      name: r.campaignName ?? r.campaignId!,
      status: r.campaignStatus ?? null,
      objective: r.objective ?? null,
      cur: baseOf(ctx, r),
      prev: null,
    });
  }
  for (const r of prevCampaigns?.rows ?? []) {
    const e = byCampaign.get(r.campaignId!);
    if (e) e.prev = baseOf(ctx, r);
    else
      byCampaign.set(r.campaignId!, {
        name: r.campaignName ?? r.campaignId!,
        status: r.campaignStatus ?? null,
        objective: r.objective ?? null,
        cur: null,
        prev: baseOf(ctx, r),
      });
  }
  const children = [...byCampaign.entries()].map(([id, c]) => ({ id, name: c.name, current: c.cur, previous: c.prev }));

  const primaryKey = kpiToMetric(ctx.settings.primaryKpi);
  const kpis: KpiCard[] = kpiKeysFor(ctx).map((key) => {
    const def = METRICS[key];
    const comparison = compareValues(dCur[key], dPrev ? dPrev[key] : null, def.direction);
    const t = targets.find((x) => kpiToMetric(x.metric) === key);
    const target =
      t && dCur[key] != null
        ? {
            value: t.targetValue,
            direction: t.direction,
            met: t.direction === "lower_better" ? dCur[key]! <= t.targetValue : dCur[key]! >= t.targetValue,
          }
        : null;
    let topContributor: KpiCard["topContributor"] = null;
    if (totalPrev && comparison.trend !== "flat" && isContributionSupported(key) && children.length > 1) {
      const top = contributions(key, children, totalCur, totalPrev)[0];
      if (top && top.contribution !== 0) topContributor = { ...top, unit: "abs" };
    }
    return { key, label: metricLabel(ctx, key), format: def.format, comparison, target, topContributor, isPrimary: key === primaryKey };
  });

  const trend: TrendPoint[] = aggregateByDate(trendRes.rows.map((r) => ({ date: r.date!, m: baseOf(ctx, r) })));

  const campaigns: CampaignSummary[] = [...byCampaign.entries()]
    .filter(([, c]) => c.cur && c.cur.spend > 0)
    .map(([id, c]) => {
      const cur = derive(c.cur!);
      const prev = c.prev ? derive(c.prev) : null;
      return {
        id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        current: cur,
        cprChange: compareValues(cur.cpr, prev?.cpr ?? null, "lower_better"),
        spendShare: totalCur.spend ? c.cur!.spend / totalCur.spend : 0,
      };
    })
    .sort((a, b) => (b.current.spend ?? 0) - (a.current.spend ?? 0));

  return {
    kpis,
    totals: { current: dCur, previous: dPrev },
    trend,
    campaigns,
    activeCampaigns: campaigns.filter((c) => c.status === "ACTIVE").length,
    meta: mergeMeta([curCampaigns.meta, trendRes.meta, curAccount.meta, ...(prevCampaigns ? [prevCampaigns.meta] : []), ...(prevAccount ? [prevAccount.meta] : [])]),
  };
}

function aggregateByDate(items: { date: string; m: BaseMetrics }[]): TrendPoint[] {
  const map = new Map<string, BaseMetrics[]>();
  for (const i of items) map.set(i.date, [...(map.get(i.date) ?? []), i.m]);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ms]) => {
      const d = derive(sumBase(ms));
      return { date, spend: d.spend ?? 0, results: d.results ?? 0, cpr: d.cpr, revenue: d.revenue };
    });
}

// ---------------------------------------------------------------------------
// Budget pacing
// ---------------------------------------------------------------------------

export type ClientPacing = Pacing & { month: string; meta: DataMeta };

export async function getClientPacing(ctx: ClientContext, now: Date = new Date()): Promise<ClientPacing> {
  const tz = ctx.settings.timezone;
  const today = todayIn(tz, now);
  const month = startOfMonth(today);

  const [res, budgetRow, agency] = await Promise.all([
    fetchGrain(ctx, "account", { from: month, to: today }, true),
    db()
      .select()
      .from(schema.clientBudgets)
      .where(and(eq(schema.clientBudgets.clientId, ctx.client.id), eq(schema.clientBudgets.month, month)))
      .limit(1)
      .then((r) => r[0]),
    getAgencySettings(),
  ]);

  const yesterday = addDays(today, -1);
  let spendToDate = 0;
  let spendThroughYesterday = 0;
  for (const r of res.rows) {
    spendToDate += r.spend;
    if (r.date && r.date <= yesterday) spendThroughYesterday += r.spend;
  }

  const pacing = computePacing({
    monthlyBudget: budgetRow?.amount ?? null,
    spendToDate,
    spendThroughYesterday,
    dayOfMonth: Number(today.slice(8, 10)),
    daysInMonth: daysInMonth(today),
    todayFraction: dayFractionIn(tz, now),
    thresholds: agency.pacingThresholds,
  });
  return { ...pacing, month, meta: res.meta };
}

// ---------------------------------------------------------------------------
// Changelog (read side, Phase 1: latest entries only)
// ---------------------------------------------------------------------------

export async function getRecentChanges(clientId: string, limit = 5) {
  return db()
    .select({
      id: schema.changelogEntries.id,
      changedAt: schema.changelogEntries.changedAt,
      category: schema.changelogEntries.category,
      action: schema.changelogEntries.action,
      campaignName: schema.changelogEntries.campaignName,
      previousValue: schema.changelogEntries.previousValue,
      newValue: schema.changelogEntries.newValue,
      authorName: schema.users.name,
    })
    .from(schema.changelogEntries)
    .leftJoin(schema.users, eq(schema.users.id, schema.changelogEntries.authorId))
    .where(eq(schema.changelogEntries.clientId, clientId))
    .orderBy(desc(schema.changelogEntries.changedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Pacing detail (Pacing page)
// ---------------------------------------------------------------------------

export type PacingDetail = {
  pacing: ClientPacing;
  cumulative: { date: string; actual: number | null; expected: number | null }[];
  campaigns: { id: string; name: string; status: string | null; dailyBudget: number | null; spend: number; avgDaily: number; share: number }[];
  /** Sum of daily budgets on active campaigns (ad set budgets are not included). */
  activeDailyBudgets: number;
  meta: DataMeta;
};

export async function getPacingDetail(ctx: ClientContext, now: Date = new Date()): Promise<PacingDetail> {
  const tz = ctx.settings.timezone;
  const today = todayIn(tz, now);
  const month = startOfMonth(today);
  const [pacing, daily, camps] = await Promise.all([
    getClientPacing(ctx, now),
    fetchGrain(ctx, "account", { from: month, to: today }, true),
    fetchGrain(ctx, "campaign", { from: month, to: today }),
  ]);

  const byDate = new Map<string, number>();
  for (const r of daily.rows) if (r.date) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.spend);
  const dim = daysInMonth(today);
  const cumulative: PacingDetail["cumulative"] = [];
  let running = 0;
  for (let d = 1; d <= dim; d++) {
    const date = `${month.slice(0, 8)}${String(d).padStart(2, "0")}`;
    if (date <= today) running += byDate.get(date) ?? 0;
    cumulative.push({
      date,
      actual: date <= today ? Math.round(running * 100) / 100 : null,
      expected: pacing.monthlyBudget ? Math.round(((pacing.monthlyBudget * d) / dim) * 100) / 100 : null,
    });
  }

  const elapsed = Math.max(1, Number(today.slice(8, 10)));
  const total = camps.rows.reduce((s, r) => s + r.spend, 0);
  const campaigns = camps.rows
    .map((r) => ({
      id: r.campaignId!,
      name: r.campaignName ?? r.campaignId!,
      status: r.campaignStatus ?? null,
      dailyBudget: r.campaignDailyBudget ?? null,
      spend: r.spend,
      avgDaily: r.spend / elapsed,
      share: total ? r.spend / total : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
  const activeDailyBudgets = campaigns.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + (c.dailyBudget ?? 0), 0);

  return { pacing, cumulative, campaigns, activeDailyBudgets, meta: mergeMeta([pacing.meta, daily.meta, camps.meta]) };
}
