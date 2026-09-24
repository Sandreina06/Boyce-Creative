import Link from "next/link";
import { Delta } from "@/components/dashboard/delta";
import { DataStatus } from "@/components/shell/data-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireClientAccess } from "@/server/auth/access";
import { CATEGORY_LABEL, type ChangeCategory } from "@/server/analytics/activity";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { IMPACT_WINDOW_DAYS, summarizeImpact, type Impact, type ImpactMetric } from "@/server/analytics/impact";
import type { MetricKey } from "@/server/analytics/metrics";
import { metricLabel } from "@/server/services/client-data";
import { getChangelog, type ChangelogEntry } from "@/server/services/changelog";

const LEVEL_LABEL = { ad: "Ad", adset: "Ad set", campaign: "Campaign", account: "Account" } as const;
const ENTITY_LABEL: Record<string, string> = { ad: "Ad", adset: "Ad set", campaign: "Campaign", account: "Account", audience: "Audience", other: "" };

export default async function ChangelogPage(props: PageProps<"/clients/[clientId]/changelog">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;

  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const includeSystem = params.system === "1";
  const category = typeof params.cat === "string" ? params.cat : null;
  const fullR = await settle(getChangelog(ctx, dates.range, { includeSystem }));
  if (!fullR.ok) return <SectionError title="Changelog" message={fullR.error} />;
  const full = fullR.data;
  const all = full.entries;
  const log = { ...full, entries: category ? all.filter((e) => e.category === category) : all };
  const categories = [...new Set(all.map((e) => e.category))] as ChangeCategory[];
  const cur = ctx.settings.currency;

  const href = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    for (const [k, v] of Object.entries(next)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    const s = sp.toString();
    return `/clients/${clientId}/changelog${s ? `?${s}` : ""}`;
  };

  const byDay = new Map<string, ChangelogEntry[]>();
  for (const e of log.entries) byDay.set(e.localDate, [...(byDay.get(e.localDate) ?? []), e]);

  const labels: Record<ImpactMetric, { label: string; key: MetricKey }> = {
    spendPerDay: { label: "Spend / day", key: "spend" },
    resultsPerDay: { label: `${ctx.settings.primaryConversionLabel} / day`, key: "results" },
    cpr: { label: metricLabel(ctx, "cpr"), key: "cpr" },
    ctr: { label: "CTR", key: "ctr" },
    cpc: { label: "CPC", key: "cpc" },
    cpm: { label: "CPM", key: "cpm" },
    cvr: { label: "CVR", key: "cvr" },
    roas: { label: "ROAS", key: "roas" },
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatRange(dates.range)}</span> · synced automatically from Meta&apos;s change history
        </p>
        <DataStatus
          source={log.meta.source}
          fetchedAt={log.meta.fetchedAt.toISOString()}
          fromCache={log.meta.fromCache}
          stale={log.meta.stale}
          clientId={ctx.client.id}
          canRefresh={!ctx.user.isGuest}
        />
      </div>

      {log.syncErrors.map((e) => (
        <p key={e} className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          {e}
        </p>
      ))}

      <p className="rounded-md border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">How to read impact:</span> each change compares the {IMPACT_WINDOW_DAYS} days before
        with the {IMPACT_WINDOW_DAYS} days after (the change day itself is excluded). Pausing or launching an ad is measured at its ad set,
        since the ad&apos;s own numbers drop to zero. Performance changes after an optimization do not necessarily mean the optimization caused
        the change.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Chip href={href({ cat: null })} active={!category}>
          All ({all.length})
        </Chip>
        {categories.map((c) => (
          <Chip key={c} href={href({ cat: c })} active={category === c}>
            {CATEGORY_LABEL[c]} ({all.filter((e) => e.category === c).length})
          </Chip>
        ))}
        <Link prefetch={false} href={href({ system: includeSystem ? null : "1" })} className="ml-auto text-xs text-primary hover:underline">
          {includeSystem ? "Hide changes made by Meta" : "Show changes made by Meta"}
        </Link>
      </div>

      {!log.entries.length && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No changes recorded in Meta for this period. Try a longer date range.
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {[...byDay.entries()].map(([day, entries]) => (
          <section key={day}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
            </h2>
            <div className="space-y-3">
              {entries.map((e) => (
                <Card key={e.id}>
                  <CardHeader className="pb-0">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="info">{CATEGORY_LABEL[e.category]}</Badge>
                        <CardTitle>{e.action}</CardTitle>
                        {e.isSystem && <Badge>Made by Meta</Badge>}
                      </div>
                      <CardDescription>
                        {e.changedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ctx.settings.timezone })} ·{" "}
                        {e.actorName ?? "Unknown"}
                        {e.entityName && (
                          <>
                            {" "}
                            · {ENTITY_LABEL[e.entityType]} <span className="font-medium text-foreground">{e.entityName}</span>
                          </>
                        )}
                        {e.entityType === "ad" && e.adsetName && <> in {e.adsetName}</>}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(e.previousValue || e.newValue) && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">{e.previousValue ?? "—"}</span> <span aria-hidden>→</span>{" "}
                        <span className="font-semibold">{e.newValue ?? "—"}</span>
                      </p>
                    )}
                    <ImpactPanel impact={e.impact} measured={e.measuredAt} labels={labels} currency={cur} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      prefetch={false}
      href={href}
      scroll={false}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ImpactPanel({
  impact,
  measured,
  labels,
  currency,
}: {
  impact: Impact | null;
  measured: ChangelogEntry["measuredAt"];
  labels: Record<ImpactMetric, { label: string; key: MetricKey }>;
  currency: string;
}) {
  if (!impact || !measured) return null;
  if (impact.status === "too_early") {
    return <p className="text-xs text-muted-foreground">Impact available once at least 3 full days have passed since the change.</p>;
  }
  if (impact.status === "no_data") {
    return <p className="text-xs text-muted-foreground">No delivery data around this change to compare.</p>;
  }
  const summary = summarizeImpact(
    impact,
    labels.cpr.label,
    labels.resultsPerDay.label.replace(/ \/ day$/, ""),
    `the ${LEVEL_LABEL[measured.level].toLowerCase()}`,
  );
  const fmt = (m: ImpactMetric, v: number | null | undefined) =>
    m === "resultsPerDay" ? (v == null ? "—" : v.toFixed(1)) : formatMetric(labels[m].key, v ?? null, currency);
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      {summary && <p className="mb-2 text-sm font-medium">{summary}</p>}
      <div className="mb-2 text-[11px] text-muted-foreground">
        Measured at {LEVEL_LABEL[measured.level].toLowerCase()} <span className="font-medium text-foreground">{measured.name}</span> ·{" "}
        {impact.beforeDays} days before vs {impact.afterDays} days after{impact.status === "partial" && " (after-period still filling)"}
      </div>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 font-semibold">Metric</th>
            <th className="py-1 text-right font-semibold">Before</th>
            <th className="py-1 text-right font-semibold">After</th>
            <th className="py-1 text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(impact.metrics) as ImpactMetric[]).map((m) => {
            const c = impact.metrics[m]!;
            return (
              <tr key={m} className="border-t border-border/60">
                <td className="py-1">{labels[m].label}</td>
                <td className="py-1 text-right text-muted-foreground">{fmt(m, c.previous)}</td>
                <td className="py-1 text-right font-medium">{fmt(m, c.current)}</td>
                <td className="py-1 text-right">
                  <Delta c={c} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
