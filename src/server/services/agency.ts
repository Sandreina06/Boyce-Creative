import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { listAccessibleClients, loadClientContext, type ClientContext } from "../auth/access";
import type { SessionUser } from "../auth/session";
import { db, schema } from "../db";
import { evaluateAttention, mergeAlerts, type Alert } from "../analytics/attention";
import { compareValues, type Comparison } from "../analytics/compare";
import { COMPARE_MODES, resolveDatesFromParams, type ResolvedDates } from "../analytics/date-ranges";
import { derive, kpiToMetric, sumBase, type Derived, type MetricKey } from "../analytics/metrics";
import { formatMetric } from "@/lib/format";
import { mergeMeta, toBase, type DataMeta } from "../windsor/service";
import { syncMetaChanges } from "./changelog";
import { getClientIntelligence } from "./intelligence";
import { fetchGrain, getAgencySettings, getClientPacing, metricLabel, type ClientPacing } from "./client-data";

export type AgencyClientRow = {
  clientId: string;
  name: string;
  currency: string;
  accountCount: number;
  resultLabel: string;
  hasRevenue: boolean;
  current: Derived | null;
  primaryKpi: { key: MetricKey; label: string; comparison: Comparison; target?: number | null };
  spendChange: Comparison | null;
  pacing: ClientPacing | null;
  activeCampaigns: number | null;
  alerts: Alert[];
  lastChange: { changedAt: Date; action: string } | null;
  meta: DataMeta | null;
  error: string | null;
};

export type AgencyOverview = {
  rows: AgencyClientRow[];
  attention: { clientId: string; clientName: string; alert: Alert }[];
  meta: DataMeta;
};

export async function getAgencyOverview(
  user: SessionUser,
  params: Record<string, string | string[] | undefined>,
): Promise<AgencyOverview> {
  const clients = await listAccessibleClients(user);
  const agency = await getAgencySettings();
  const clientIds = clients.map((c) => c.id);

  // Sync each client's Meta change history first so "Last change" is current.
  await Promise.all(
    clients.map(async (c) => {
      const ctx = await loadClientContext(user, c.id);
      if (ctx.accountIds.length) await syncMetaChanges(ctx).catch(() => undefined);
    }),
  );

  const [targets, lastChanges] = await Promise.all([
    clientIds.length
      ? db().select().from(schema.clientTargets).where(inArray(schema.clientTargets.clientId, clientIds))
      : [],
    clientIds.length
      ? db()
          .selectDistinctOn([schema.changelogEntries.clientId], {
            clientId: schema.changelogEntries.clientId,
            changedAt: schema.changelogEntries.changedAt,
            action: schema.changelogEntries.action,
          })
          .from(schema.changelogEntries)
          .where(and(inArray(schema.changelogEntries.clientId, clientIds), eq(schema.changelogEntries.isSystem, false)))
          .orderBy(schema.changelogEntries.clientId, desc(schema.changelogEntries.changedAt))
      : [],
  ]);

  const rows = await Promise.all(
    clients.map(async (c): Promise<AgencyClientRow> => {
      const ctx = await loadClientContext(user, c.id);
      const dates = resolveDatesFromParams(params, ctx.settings.timezone);
      const primaryKey = kpiToMetric(ctx.settings.primaryKpi);
      const target = targets.find((t) => t.clientId === c.id && kpiToMetric(t.metric) === primaryKey);
      const lastChange = lastChanges.find((l) => l.clientId === c.id) ?? null;
      const base: AgencyClientRow = {
        clientId: c.id,
        name: c.name,
        currency: ctx.settings.currency,
        accountCount: ctx.accountIds.length,
        resultLabel: ctx.settings.primaryConversionLabel,
        hasRevenue: !!ctx.settings.primaryValueField,
        current: null,
        primaryKpi: {
          key: primaryKey,
          label: metricLabel(ctx, primaryKey),
          comparison: compareValues(null, null, "neutral"),
          target: target?.targetValue ?? null,
        },
        spendChange: null,
        pacing: null,
        activeCampaigns: null,
        alerts: [],
        lastChange: lastChange ? { changedAt: lastChange.changedAt, action: lastChange.action } : null,
        meta: null,
        error: null,
      };
      if (!ctx.accountIds.length) return { ...base, error: "No Meta ad account mapped" };
      try {
        const summary = await clientSummary(ctx, dates, primaryKey, agency.attentionThresholds);
        return { ...base, ...summary, primaryKpi: { ...summary.primaryKpi, target: base.primaryKpi.target } };
      } catch (err) {
        console.error(`[agency] ${c.name}:`, err);
        return { ...base, error: (err as Error).message };
      }
    }),
  );

  const attention = rows
    .flatMap((r) => r.alerts.map((alert) => ({ clientId: r.clientId, clientName: r.name, alert })))
    .sort((a, b) => sevRank(a.alert.severity) - sevRank(b.alert.severity));

  return { rows, attention, meta: mergeMeta(rows.flatMap((r) => (r.meta ? [r.meta] : []))) };
}

const SEV: Record<Alert["severity"], number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
const sevRank = (s: Alert["severity"]) => SEV[s];

async function clientSummary(
  ctx: ClientContext,
  dates: ResolvedDates,
  primaryKey: MetricKey,
  thresholds: Awaited<ReturnType<typeof getAgencySettings>>["attentionThresholds"],
) {
  const conv = ctx.settings.primaryConversionField;
  const val = ctx.settings.primaryValueField;
  const [cur, prev, campaigns, pacing] = await Promise.all([
    fetchGrain(ctx, "account", dates.range),
    dates.comparison ? fetchGrain(ctx, "account", dates.comparison) : null,
    fetchGrain(ctx, "campaign", dates.range),
    getClientPacing(ctx),
  ]);
  const current = derive(sumBase(cur.rows.map((r) => toBase(r, conv, val))));
  const previous = prev ? derive(sumBase(prev.rows.map((r) => toBase(r, conv, val)))) : null;
  const dir = primaryKey === "roas" || primaryKey === "ctr" || primaryKey === "cvr" ? "higher_better" : "lower_better";
  const comparisonLabel =
    COMPARE_MODES.find((m) => m.id === dates.compare)?.label.toLowerCase() ?? "previous period";

  const basic = evaluateAttention({
    primaryKpi: primaryKey,
    primaryKpiLabel: metricLabel(ctx, primaryKey),
    resultLabel: ctx.settings.primaryConversionLabel,
    current,
    previous,
    pacing,
    thresholds,
    comparisonLabel,
    formatValue: (k, v) => formatMetric(k, v, ctx.settings.currency),
  });

  // Full account-health + strategy analysis (same as the client's Insights page).
  const intel = await getClientIntelligence(ctx, dates).catch((err) => {
    console.error(`[agency] intelligence for ${ctx.client.name}:`, (err as Error).message);
    return null;
  });
  const alerts = mergeAlerts(basic, intel?.issues ?? []);

  return {
    current,
    primaryKpi: {
      key: primaryKey,
      label: metricLabel(ctx, primaryKey),
      comparison: compareValues(current[primaryKey], previous?.[primaryKey] ?? null, dir),
    },
    spendChange: compareValues(current.spend, previous?.spend ?? null, "neutral"),
    pacing,
    activeCampaigns: campaigns.rows.filter((r) => r.campaignStatus === "ACTIVE" && r.spend > 0).length,
    alerts,
    meta: mergeMeta([cur.meta, campaigns.meta, pacing.meta, ...(prev ? [prev.meta] : []), ...(intel ? [intel.meta] : [])]),
  };
}

