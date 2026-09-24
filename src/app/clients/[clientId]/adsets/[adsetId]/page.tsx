import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendCharts } from "@/components/charts/trend-charts";
import { EntityChanges } from "@/components/dashboard/entity-changes";
import { EntitySummary } from "@/components/dashboard/entity-summary";
import { EntityTableView } from "@/components/dashboard/entity-table";
import { PageStatus } from "@/components/dashboard/page-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import { dateQuery } from "@/lib/qs";
import { requireClientAccess } from "@/server/auth/access";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { getEntityChanges } from "@/server/services/changelog";
import { metricLabel } from "@/server/services/client-data";
import { mergeMeta } from "@/server/services/data-meta";
import { columnsFor } from "@/server/services/entity-columns";
import { getEntityTable, getEntityTrend } from "@/server/services/entities";

const LEARNING: Record<string, string> = { FAIL: "Learning limited", LEARNING: "In learning phase" };

export default async function AdSetDetail(props: PageProps<"/clients/[clientId]/adsets/[adsetId]">) {
  const { clientId, adsetId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!/^\d+$/.test(adsetId)) notFound();
  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const qs = dateQuery(params);

  const [setR, adsR, trendR] = await Promise.all([
    settle(getEntityTable(ctx, dates, "adset")),
    settle(getEntityTable(ctx, dates, "ad", { adsetId })),
    settle(getEntityTrend(ctx, dates, "adset", adsetId)),
  ]);
  if (!setR.ok) return <SectionError title="Ad set" message={setR.error} />;
  const a = setR.data.rows.find((r) => r.id === adsetId);
  if (!a) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          This ad set had no delivery in {formatRange(dates.range)}. Try a longer date range, or go back to{" "}
          <Link prefetch={false} className="text-primary hover:underline" href={`/clients/${clientId}/adsets?${qs}`}>
            all ad sets
          </Link>
          .
        </CardContent>
      </Card>
    );
  }
  const changes = await getEntityChanges(ctx.client.id, { adsetIds: [adsetId] });
  const cur = ctx.settings.currency;
  const t = a.targeting;
  const kpis = (["spend", "results", "cpr", "ctr", "cpc", "cpm", "frequency", "cvr"] as const).map((k) => ({
    key: k,
    label: k === "results" ? ctx.settings.primaryConversionLabel : k === "cpr" ? metricLabel(ctx, "cpr") : k === "frequency" ? "Frequency" : k === "spend" ? "Spend" : k.toUpperCase(),
    value: a.current[k],
    c: a.changes[k],
  }));

  return (
    <>
      <div className="space-y-1">
        <div className="text-xs">
          <Link prefetch={false} href={`/clients/${clientId}/adsets?${qs}`} className="text-primary hover:underline">
            ← Ad sets
          </Link>
          {a.campaignId && (
            <>
              {" · "}
              <Link prefetch={false} href={`/clients/${clientId}/campaigns/${a.campaignId}?${qs}`} className="text-primary hover:underline">
                {a.campaignName}
              </Link>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{a.name}</h2>
          {a.status && <Badge variant={a.status === "ACTIVE" ? "good" : "default"}>{a.status.toLowerCase().replace(/_/g, " ")}</Badge>}
          {a.flags.map((f) => (
            <Badge key={f.label} variant={f.tone === "critical" ? "critical" : f.tone === "warning" ? "warning" : f.tone === "good" ? "good" : "info"}>
              {f.label}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          ID {a.id} · optimizing for {a.optimizationGoal?.toLowerCase().replace(/_/g, " ") ?? "—"} ·{" "}
          {a.dailyBudget ? `${formatMetric("spend", a.dailyBudget, cur)}/day` : a.lifetimeBudget ? `${formatMetric("spend", a.lifetimeBudget, cur)} lifetime` : "Campaign budget (CBO)"} ·{" "}
          {a.learningStage ? (LEARNING[a.learningStage] ?? a.learningStage) : "Learning complete / inactive"}
        </p>
      </div>

      <PageStatus
        left={
          <>
            <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
            {dates.comparison && ` vs ${formatRange(dates.comparison)}`}
          </>
        }
        meta={mergeMeta([setR.data.meta, ...(trendR.ok ? [trendR.data.meta] : [])])}
        clientId={ctx.client.id}
        canRefresh={!ctx.user.isGuest}
      />

      <EntitySummary items={kpis} currency={cur} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
              <CardTitle>Targeting</CardTitle>
              <CardDescription>As set in Meta (via Windsor)</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-2 text-sm">
            {t ? (
              <>
                <Row k="Ages" v={t.ages ?? "All"} />
                <Row k="Gender" v={t.genders ?? "All"} />
                <Row k="Advantage+ audience" v={t.advantageAudience == null ? "—" : t.advantageAudience ? "On" : "Off"} />
                <Row k="Placements" v={t.placements ?? "—"} />
                <div>
                  <div className="text-xs text-muted-foreground">Locations{t.excludedLocations ? ` (${t.excludedLocations} excluded areas)` : ""}</div>
                  <div className="mt-0.5 text-xs">{t.locations.length ? t.locations.join(" · ") : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Interests / behaviours</div>
                  <div className="mt-0.5 text-xs">{t.interests.length ? t.interests.join(" · ") : "None (broad)"}</div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Targeting not available for this ad set.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ads in this ad set</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          {adsR.ok ? (
            <EntityTableView rows={adsR.data.rows} columns={columnsFor(ctx, "ad")} currency={cur} entityLabel="Ad" />
          ) : (
            <p className="px-3 text-sm text-muted-foreground">{adsR.error}</p>
          )}
        </CardContent>
      </Card>

      <EntityChanges changes={changes} changelogHref={`/clients/${clientId}/changelog?${qs}`} />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right text-xs font-medium">{v}</span>
    </div>
  );
}
