import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendCharts } from "@/components/charts/trend-charts";
import { EntityChanges } from "@/components/dashboard/entity-changes";
import { EntitySummary } from "@/components/dashboard/entity-summary";
import { EntityTableView } from "@/components/dashboard/entity-table";
import { PageStatus } from "@/components/dashboard/page-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import { dateQuery } from "@/lib/qs";
import { requireClientAccess } from "@/server/auth/access";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { getEntityChanges } from "@/server/services/changelog";
import { metricLabel } from "@/server/services/client-data";
import { mergeMeta } from "@/server/services/data-meta";
import { columnsFor } from "@/server/services/entity-columns";
import { getEntityTable, getEntityTrend } from "@/server/services/entities";

export default async function CampaignDetail(props: PageProps<"/clients/[clientId]/campaigns/[campaignId]">) {
  const { clientId, campaignId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!/^\d+$/.test(campaignId)) notFound();
  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const qs = dateQuery(params);

  const [campR, adsetsR, adsR, trendR] = await Promise.all([
    settle(getEntityTable(ctx, dates, "campaign")),
    settle(getEntityTable(ctx, dates, "adset", { campaignId })),
    settle(getEntityTable(ctx, dates, "ad", { campaignId })),
    settle(getEntityTrend(ctx, dates, "campaign", campaignId)),
  ]);
  if (!campR.ok) return <SectionError title="Campaign" message={campR.error} />;
  const c = campR.data.rows.find((r) => r.id === campaignId);
  if (!c) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          This campaign had no delivery in {formatRange(dates.range)}. Try a longer date range, or go back to{" "}
          <Link prefetch={false} className="text-primary hover:underline" href={`/clients/${clientId}/campaigns?${qs}`}>
            all campaigns
          </Link>
          .
        </CardContent>
      </Card>
    );
  }
  const adsetIds = adsetsR.ok ? adsetsR.data.rows.map((r) => r.id) : [];
  const changes = await getEntityChanges(ctx.client.id, { campaignId, adsetIds });
  const cur = ctx.settings.currency;
  const kpis = (["spend", "results", "cpr", "ctr", "cpc", "cpm", "frequency", "cvr"] as const).map((k) => ({
    key: k,
    label: k === "results" ? ctx.settings.primaryConversionLabel : k === "cpr" ? metricLabel(ctx, "cpr") : k.toUpperCase().replace("FREQUENCY", "Frequency").replace("SPEND", "Spend"),
    value: c.current[k],
    c: c.changes[k],
  }));

  return (
    <>
      <div className="space-y-1">
        <Link prefetch={false} href={`/clients/${clientId}/campaigns?${qs}`} className="text-xs text-primary hover:underline">
          ← Campaigns
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          {c.status && <Badge variant={c.status === "ACTIVE" ? "good" : "default"}>{c.status.toLowerCase().replace(/_/g, " ")}</Badge>}
          {c.objective && <Badge>{c.objective.replace("OUTCOME_", "").toLowerCase()}</Badge>}
          {c.flags.map((f) => (
            <Badge key={f.label} variant={f.tone === "critical" ? "critical" : f.tone === "warning" ? "warning" : f.tone === "good" ? "good" : "info"}>
              {f.label}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          ID {c.id} · {c.dailyBudget ? `${formatMetric("spend", c.dailyBudget, cur)}/day campaign budget` : c.lifetimeBudget ? `${formatMetric("spend", c.lifetimeBudget, cur)} lifetime budget` : "Budget set at ad set level"} ·{" "}
          {Math.round(c.spendShare * 100)}% of account spend
        </p>
      </div>

      <PageStatus
        left={
          <>
            <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
            {dates.comparison && ` vs ${formatRange(dates.comparison)}`}
          </>
        }
        meta={mergeMeta([campR.data.meta, ...(adsetsR.ok ? [adsetsR.data.meta] : []), ...(trendR.ok ? [trendR.data.meta] : [])])}
        clientId={ctx.client.id}
        canRefresh={!ctx.user.isGuest}
      />

      <EntitySummary items={kpis} currency={cur} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Daily performance</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {trendR.ok ? (
            <TrendCharts data={trendR.data.trend} currency={cur} resultLabel={ctx.settings.primaryConversionLabel} cprLabel={metricLabel(ctx, "cpr")} />
          ) : (
            <p className="text-sm text-muted-foreground">Trend unavailable: {trendR.error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ad sets in this campaign</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          {adsetsR.ok ? (
            <EntityTableView rows={adsetsR.data.rows} columns={columnsFor(ctx, "adset")} currency={cur} hrefBase={`/clients/${clientId}/adsets/`} query={qs} showBudget entityLabel="Ad set" />
          ) : (
            <p className="px-3 text-sm text-muted-foreground">{adsetsR.error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ads in this campaign</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          {adsR.ok ? (
            <EntityTableView rows={adsR.data.rows} columns={columnsFor(ctx, "ad")} currency={cur} showParents="adset" entityLabel="Ad" />
          ) : (
            <p className="px-3 text-sm text-muted-foreground">{adsR.error}</p>
          )}
        </CardContent>
      </Card>

      <EntityChanges changes={changes} changelogHref={`/clients/${clientId}/changelog?${qs}`} />
    </>
  );
}
