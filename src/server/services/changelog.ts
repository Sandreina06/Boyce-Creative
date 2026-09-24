import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { ClientContext } from "../auth/access";
import { db, schema } from "../db";
import { parseActivity, resolveStatusChains, type ChangeCategory, type EntityKind, type RawActivity } from "../analytics/activity";
import { addDays, todayIn, type DateRange } from "../analytics/date-ranges";
import { computeImpact, IMPACT_WINDOW_DAYS, measurementLevel, type Impact, type ImpactLevel } from "../analytics/impact";
import type { BaseMetrics } from "../analytics/metrics";
import { getAccountActivity, mergeMeta, toBase, type DataMeta, type Grain } from "../windsor/service";
import { fetchGrain } from "./client-data";

/** How far back each sync looks. Older entries stay in Postgres once synced. */
const SYNC_LOOKBACK_DAYS = 90;

/**
 * Pull Meta's change history for each of the client's ad accounts and store
 * new decisions in changelog_entries (de-duplicated by meta_activity_ref).
 * Runs on page load; Windsor results are cached, so this is cheap.
 */
export async function syncMetaChanges(ctx: ClientContext): Promise<{ inserted: number; meta: DataMeta[]; errors: string[] }> {
  const today = todayIn(ctx.settings.timezone);
  const range: DateRange = { from: addDays(today, -SYNC_LOOKBACK_DAYS), to: today };
  const metas: DataMeta[] = [];
  const errors: string[] = [];
  let inserted = 0;

  for (const accountId of ctx.accountIds) {
    try {
      const { rows, meta } = await getAccountActivity(accountId, range);
      metas.push(meta);
      const parsed = resolveStatusChains(
        rows.map((r) => parseActivity(r as RawActivity, accountId, ctx.settings.currency)).filter((p) => p != null),
      ).filter((p) => !p.isNoise);
      if (!parsed.length) continue;

      const values = parsed.map((p) => ({
        clientId: ctx.client.id,
        metaAccountId: accountId,
        campaignId: p.entityType === "campaign" ? p.entityId : null,
        campaignName: p.entityType === "campaign" ? p.entityName : null,
        adsetId: p.entityType === "adset" ? p.entityId : p.parentAdsetId,
        adsetName: p.entityType === "adset" ? p.entityName : null,
        adId: p.entityType === "ad" ? p.entityId : null,
        adName: p.entityType === "ad" ? p.entityName : null,
        changedAt: p.changedAt,
        category: p.category,
        action: p.action,
        previousValue: p.previousValue,
        newValue: p.newValue,
        source: "meta_activity" as const,
        metaActivityRef: p.ref,
        actorName: p.actorName,
        isSystem: p.isSystem,
        eventType: p.eventType,
        entityType: p.entityType,
        notes: p.entityType === "audience" || p.entityType === "account" || p.entityType === "other" ? p.entityName : null,
      }));
      const res = await db()
        .insert(schema.changelogEntries)
        .values(values)
        .onConflictDoNothing({ target: schema.changelogEntries.metaActivityRef })
        .returning({ id: schema.changelogEntries.id });
      inserted += res.length;
    } catch (err) {
      console.error(`[changelog] sync failed for ${accountId}:`, (err as Error).message);
      errors.push(`Could not load Meta change history for act_${accountId}: ${(err as Error).message}`);
    }
  }
  return { inserted, meta: metas, errors };
}

export type ChangelogEntry = {
  id: string;
  changedAt: Date;
  localDate: string;
  actorName: string | null;
  isSystem: boolean;
  category: ChangeCategory;
  action: string;
  entityType: EntityKind;
  entityName: string | null;
  campaignName: string | null;
  adsetName: string | null;
  previousValue: string | null;
  newValue: string | null;
  measuredAt: { level: ImpactLevel; name: string } | null;
  impact: Impact | null;
};

export type Changelog = {
  entries: ChangelogEntry[];
  syncErrors: string[];
  meta: DataMeta;
};

/**
 * Changes in the selected date range with before/after impact. Impact uses
 * IMPACT_WINDOW_DAYS on each side at the level given by measurementLevel().
 */
export async function getChangelog(
  ctx: ClientContext,
  range: DateRange,
  opts: { includeSystem?: boolean; category?: string | null } = {},
): Promise<Changelog> {
  const sync = await syncMetaChanges(ctx);
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const yesterday = addDays(today, -1);

  // Stored timestamps are UTC; widen by a day and filter on local date below.
  const rows = await db()
    .select()
    .from(schema.changelogEntries)
    .where(
      and(
        eq(schema.changelogEntries.clientId, ctx.client.id),
        gte(schema.changelogEntries.changedAt, new Date(`${addDays(range.from, -1)}T00:00:00Z`)),
        lte(schema.changelogEntries.changedAt, new Date(`${addDays(range.to, 2)}T00:00:00Z`)),
      ),
    )
    .orderBy(desc(schema.changelogEntries.changedAt));

  const inRange = rows
    .map((r) => ({ ...r, localDate: todayIn(tz, r.changedAt) }))
    .filter((r) => r.localDate >= range.from && r.localDate <= range.to)
    .filter((r) => opts.includeSystem || !r.isSystem)
    .filter((r) => !opts.category || r.category === opts.category);

  // ---- Daily data for impact, one query per grain actually needed ---------------
  const plan = inRange.map((r) => {
    const { level, useParent } = measurementLevel(r.category as ChangeCategory, (r.entityType ?? "other") as EntityKind);
    let id: string | null = null;
    if (level === "ad") id = r.adId;
    else if (level === "adset") id = useParent ? r.adsetId : (r.adsetId ?? null);
    else if (level === "campaign") id = r.campaignId; // resolved from ad set below when needed
    return { row: r, level, id, needsCampaignFromAdset: level === "campaign" && !r.campaignId ? r.adsetId : null };
  });

  const metas: DataMeta[] = [...sync.meta];
  const hasRevenue = !!ctx.settings.primaryValueField;
  const series = new Map<string, Map<string, BaseMetrics>>(); // `${level}:${id}` → date → metrics
  const names = new Map<string, string>();

  if (plan.length && ctx.accountIds.length) {
    const earliest = inRange.reduce((m, r) => (r.localDate < m ? r.localDate : m), range.to);
    const latest = inRange.reduce((m, r) => (r.localDate > m ? r.localDate : m), range.from);
    const window: DateRange = {
      from: addDays(earliest, -IMPACT_WINDOW_DAYS),
      to: addDays(latest, IMPACT_WINDOW_DAYS) > yesterday ? yesterday : addDays(latest, IMPACT_WINDOW_DAYS),
    };
    if (window.from <= window.to) {
      const levels = new Set<ImpactLevel>(plan.map((p) => p.level));
      if (plan.some((p) => p.needsCampaignFromAdset)) levels.add("adset");
      const grainOf: Record<ImpactLevel, Grain> = { ad: "ad", adset: "adset", campaign: "campaign", account: "account" };
      const results = await Promise.all([...levels].map(async (lvl) => ({ lvl, res: await fetchGrain(ctx, grainOf[lvl], window, true) })));
      const adsetToCampaign = new Map<string, string>();
      for (const { lvl, res } of results) {
        metas.push(res.meta);
        for (const r of res.rows) {
          const id = lvl === "ad" ? r.adId : lvl === "adset" ? r.adsetId : lvl === "campaign" ? r.campaignId : "account";
          if (!id || !r.date) continue;
          if (lvl === "adset" && r.campaignId) adsetToCampaign.set(id, r.campaignId);
          const name = lvl === "ad" ? r.adName : lvl === "adset" ? r.adsetName : lvl === "campaign" ? r.campaignName : ctx.client.name;
          if (name) names.set(`${lvl}:${id}`, name);
          const key = `${lvl}:${id}`;
          const m = series.get(key) ?? new Map<string, BaseMetrics>();
          const prev = m.get(r.date);
          const b = toBase(r, ctx.settings.primaryConversionField, ctx.settings.primaryValueField);
          m.set(
            r.date,
            prev
              ? { ...prev, spend: prev.spend + b.spend, impressions: prev.impressions + b.impressions, clicks: prev.clicks + b.clicks, linkClicks: prev.linkClicks + b.linkClicks, results: prev.results + b.results, revenue: prev.revenue == null && b.revenue == null ? null : (prev.revenue ?? 0) + (b.revenue ?? 0), reach: null }
              : b,
          );
          series.set(key, m);
        }
      }
      for (const p of plan) if (p.needsCampaignFromAdset) p.id = adsetToCampaign.get(p.needsCampaignFromAdset) ?? null;
    }
  }

  const entries: ChangelogEntry[] = plan.map(({ row: r, level, id }) => {
    const key = level === "account" ? "account:account" : id ? `${level}:${id}` : null;
    const daily = key ? series.get(key) : undefined;
    return {
      id: r.id,
      changedAt: r.changedAt,
      localDate: r.localDate,
      actorName: r.actorName,
      isSystem: r.isSystem,
      category: r.category as ChangeCategory,
      action: r.action,
      entityType: (r.entityType ?? "other") as EntityKind,
      entityName: r.adName ?? r.adsetName ?? r.campaignName ?? r.notes ?? null,
      campaignName: r.campaignName,
      adsetName: r.adsetName ?? (r.adsetId ? (names.get(`adset:${r.adsetId}`) ?? null) : null),
      previousValue: r.previousValue,
      newValue: r.newValue,
      measuredAt: key ? { level, name: names.get(key) ?? (level === "account" ? ctx.client.name : "—") } : null,
      impact: daily ? computeImpact(r.localDate, daily, yesterday, hasRevenue) : key ? computeImpact(r.localDate, new Map(), yesterday, hasRevenue) : null,
    };
  });

  return { entries, syncErrors: sync.errors, meta: mergeMeta(metas) };
}

/** Latest non-system changes for the overview card (syncs first). */
export async function getRecentMetaChanges(ctx: ClientContext, limit = 5) {
  await syncMetaChanges(ctx);
  return db()
    .select({
      id: schema.changelogEntries.id,
      changedAt: schema.changelogEntries.changedAt,
      category: schema.changelogEntries.category,
      action: schema.changelogEntries.action,
      actorName: schema.changelogEntries.actorName,
      adName: schema.changelogEntries.adName,
      adsetName: schema.changelogEntries.adsetName,
      campaignName: schema.changelogEntries.campaignName,
      previousValue: schema.changelogEntries.previousValue,
      newValue: schema.changelogEntries.newValue,
    })
    .from(schema.changelogEntries)
    .where(and(eq(schema.changelogEntries.clientId, ctx.client.id), eq(schema.changelogEntries.isSystem, false)))
    .orderBy(desc(schema.changelogEntries.changedAt))
    .limit(limit);
}

/** Stored changes touching a campaign (directly or via its ad sets/ads) or an ad set. */
export async function getEntityChanges(clientId: string, scope: { campaignId?: string; adsetIds?: string[] }, limit = 10) {
  const { inArray, or } = await import("drizzle-orm");
  const conds = [
    ...(scope.campaignId ? [eq(schema.changelogEntries.campaignId, scope.campaignId)] : []),
    ...(scope.adsetIds?.length ? [inArray(schema.changelogEntries.adsetId, scope.adsetIds)] : []),
  ];
  if (!conds.length) return [];
  return db()
    .select()
    .from(schema.changelogEntries)
    .where(and(eq(schema.changelogEntries.clientId, clientId), eq(schema.changelogEntries.isSystem, false), or(...conds)))
    .orderBy(desc(schema.changelogEntries.changedAt))
    .limit(limit);
}
