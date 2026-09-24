import Link from "next/link";
import { AttentionList } from "@/components/dashboard/attention-list";
import { Delta } from "@/components/dashboard/delta";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PacingCard } from "@/components/dashboard/pacing-card";
import { TrendCharts } from "@/components/charts/trend-charts";
import { DataStatus } from "@/components/shell/data-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMetric, formatRelativeTime } from "@/lib/format";
import { requireClientAccess } from "@/server/auth/access";
import { evaluateAttention } from "@/server/analytics/attention";
import { COMPARE_MODES, formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { kpiToMetric } from "@/server/analytics/metrics";
import {
  getAgencySettings,
  getClientOverview,
  getClientPacing,
  metricLabel,
} from "@/server/services/client-data";
import { mergeMeta } from "@/server/services/data-meta";
import { getClientIntelligence } from "@/server/services/intelligence";
import { getRecentMetaChanges } from "@/server/services/changelog";
import { IssueList } from "@/components/dashboard/issue-list";
import { SectionError, settle } from "@/components/dashboard/section-error";

export default async function OverviewPage(props: PageProps<"/clients/[clientId]/overview">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  const qs = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  if (!ctx.accountIds.length) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          This client has no Meta ad account mapped yet.{" "}
          <Link prefetch={false} className="text-primary hover:underline" href={`/clients/${clientId}/settings`}>
            Map one in Settings
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const [overviewR, pacingR, changes, agency, intelR] = await Promise.all([
    settle(getClientOverview(ctx, dates)),
    settle(getClientPacing(ctx)),
    getRecentMetaChanges(ctx).catch(() => []),
    getAgencySettings(),
    settle(getClientIntelligence(ctx, dates)),
  ]);
  if (!overviewR.ok) return <SectionError title="Performance data" message={overviewR.error} />;
  const overview = overviewR.data;
  const pacing = pacingR.ok ? pacingR.data : null;
  const intel = intelR.ok ? intelR.data : null;
  const currency = ctx.settings.currency;
  const compareLabel = COMPARE_MODES.find((m) => m.id === dates.compare)?.label.toLowerCase() ?? null;
  const primaryKey = kpiToMetric(ctx.settings.primaryKpi);
  const alerts = evaluateAttention({
    primaryKpi: primaryKey,
    primaryKpiLabel: metricLabel(ctx, primaryKey),
    resultLabel: ctx.settings.primaryConversionLabel,
    current: overview.totals.current,
    previous: overview.totals.previous,
    pacing: pacing ?? null,
    thresholds: agency.attentionThresholds,
    comparisonLabel: compareLabel ?? "previous period",
    formatValue: (k, v) => formatMetric(k, v, currency),
  });
  const meta = mergeMeta([overview.meta, ...(pacing ? [pacing.meta] : []), ...(intel ? [intel.meta] : [])]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
          {dates.comparison && ` vs ${formatRange(dates.comparison)}`} · Results = {ctx.settings.primaryConversionLabel} (
          <code className="text-xs">{ctx.settings.primaryConversionField}</code>) · Attribution: {ctx.settings.attributionWindow}
        </p>
        <DataStatus
          source={meta.source}
          fetchedAt={meta.fetchedAt.toISOString()}
          fromCache={meta.fromCache}
          stale={meta.stale}
          clientId={ctx.client.id}
          canRefresh={!ctx.user.isGuest}
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {overview.kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} currency={currency} comparisonLabel={dates.comparison ? compareLabel : null} />
        ))}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Performance over time</CardTitle>
            <CardDescription>Daily, {formatRange(dates.range)}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TrendCharts
            data={overview.trend}
            currency={currency}
            resultLabel={ctx.settings.primaryConversionLabel}
            cprLabel={metricLabel(ctx, "cpr")}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Campaign performance</CardTitle>
              <CardDescription>
                {overview.activeCampaigns} active campaigns with delivery · sorted by spend
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-2 pt-2">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Campaign</TH>
                  <TH className="text-right">Spend</TH>
                  <TH className="text-right">Share</TH>
                  <TH className="text-right">{ctx.settings.primaryConversionLabel}</TH>
                  <TH className="text-right">{metricLabel(ctx, "cpr")}</TH>
                  <TH className="text-right">Δ</TH>
                  <TH className="text-right">CTR</TH>
                  <TH className="text-right">CPM</TH>
                  {ctx.settings.primaryValueField && <TH className="text-right">ROAS</TH>}
                </TR>
              </THead>
              <TBody>
                {overview.campaigns.slice(0, 10).map((c) => (
                  <TR key={c.id}>
                    <TD className="max-w-72">
                      <div className="truncate font-medium" title={c.name}>
                        {c.name}
                      </div>
                      <div className="flex gap-1.5 text-[11px] text-muted-foreground">
                        {c.status && <Badge variant={c.status === "ACTIVE" ? "good" : "default"}>{c.status}</Badge>}
                        {c.objective && <span>{c.objective.replace("OUTCOME_", "").toLowerCase()}</span>}
                      </div>
                    </TD>
                    <TD className="text-right">{formatMetric("spend", c.current.spend, currency)}</TD>
                    <TD className="text-right text-muted-foreground">{Math.round(c.spendShare * 100)}%</TD>
                    <TD className="text-right">{formatMetric("results", c.current.results, currency)}</TD>
                    <TD className="text-right">{formatMetric("cpr", c.current.cpr, currency)}</TD>
                    <TD className="text-right">
                      <Delta c={c.cprChange} />
                    </TD>
                    <TD className="text-right">{formatMetric("ctr", c.current.ctr, currency)}</TD>
                    <TD className="text-right">{formatMetric("cpm", c.current.cpm, currency)}</TD>
                    {ctx.settings.primaryValueField && (
                      <TD className="text-right">{formatMetric("roas", c.current.roas, currency)}</TD>
                    )}
                  </TR>
                ))}
                {!overview.campaigns.length && (
                  <TR>
                    <TD colSpan={9} className="py-6 text-center text-muted-foreground">
                      No campaign delivery in this period.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
            {overview.campaigns.length > 10 && (
              <Link prefetch={false} href={`/clients/${clientId}/campaigns${qs ? `?${qs}` : ""}`} className="mt-2 block px-3 text-xs text-primary hover:underline">
                All {overview.campaigns.length} campaigns →
              </Link>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>For the selected period</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <AttentionList items={alerts.map((a, i) => ({ key: String(i), alert: a }))} />
            </CardContent>
          </Card>
          {pacing ? (
            <PacingCard pacing={pacing} currency={currency} settingsHref={`/clients/${clientId}/settings`} />
          ) : (
            <SectionError title="Budget pacing" message={!pacingR.ok ? pacingR.error : ""} />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top issues &amp; recommendations</CardTitle>
              <CardDescription>From account data, client context and industry benchmarks</CardDescription>
            </div>
            <Link prefetch={false} href={`/clients/${clientId}/insights${qs ? `?${qs}` : ""}`} className="text-xs text-primary hover:underline">
              All {intel?.issues.length ?? 0} →
            </Link>
          </CardHeader>
          <CardContent className="pt-1">
            {intel ? (
              <IssueList issues={intel.issues.filter((i) => i.severity !== "info").slice(0, 4)} compact />
            ) : (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load issues: {!intelR.ok ? intelR.error : ""}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent changes</CardTitle>
              <CardDescription>Synced automatically from Meta&apos;s change history</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {changes.length ? (
              <ul className="divide-y divide-border text-sm">
                {changes.map((c) => (
                  <li key={c.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <Badge>{c.category.replace(/_/g, " ")}</Badge>
                      <span className="font-medium">{c.action}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.actorName ?? "Unknown"} · {formatRelativeTime(c.changedAt)}
                      {(c.adName ?? c.adsetName ?? c.campaignName) && ` · ${c.adName ?? c.adsetName ?? c.campaignName}`}
                      {c.previousValue && c.newValue && ` · ${c.previousValue} → ${c.newValue}`}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No changes found in Meta&apos;s change history yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
