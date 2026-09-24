/* eslint-disable @next/next/no-img-element -- Meta CDN thumbnails are signed, expiring URLs; next/image would cache them. */
import Link from "next/link";
import { DataStatus } from "@/components/shell/data-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMetric, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireClientAccess } from "@/server/auth/access";
import { bestGroup, describeDestination, type CopyGroup } from "@/server/analytics/copy";
import { CREATIVE_LABEL_TEXT, videoRates, type CreativeLabel } from "@/server/analytics/creative";
import { compareValues } from "@/server/analytics/compare";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { kpiToMetric } from "@/server/analytics/metrics";
import { metricLabel } from "@/server/services/client-data";
import { getClientIntelligence, type CreativeRow } from "@/server/services/intelligence";

const LABEL_VARIANT: Record<CreativeLabel, "good" | "info" | "warning" | "critical" | "default"> = {
  winner: "good",
  scaling_candidate: "info",
  fatigue: "warning",
  underperformer: "critical",
  stable: "default",
  low_data: "default",
};
const LABEL_ORDER: CreativeLabel[] = ["fatigue", "underperformer", "winner", "scaling_candidate", "stable", "low_data"];

export default async function CreativePage(props: PageProps<"/clients/[clientId]/creative">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;

  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const intel = await getClientIntelligence(ctx, dates);
  const cur = ctx.settings.currency;
  const filter = typeof params.label === "string" && LABEL_ORDER.includes(params.label as CreativeLabel) ? (params.label as CreativeLabel) : null;
  const shown = filter ? intel.creatives.filter((c) => c.label === filter || c.alsoFlags.includes(filter)) : intel.creatives;
  const efficiency = kpiToMetric(ctx.settings.primaryKpi) === "roas" ? "roas" : "cpr";
  const cprLabel = metricLabel(ctx, "cpr");
  const qs = (label: string | null) => {
    const sp = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" && k !== "label" ? [[k, v]] : [])));
    if (label) sp.set("label", label);
    const s = sp.toString();
    return `/clients/${clientId}/creative${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
          {dates.comparison && ` vs ${formatRange(dates.comparison)}`} · labels use several signals at once — high frequency alone is never called fatigue
        </p>
        <DataStatus
          source={intel.meta.source}
          fetchedAt={intel.meta.fetchedAt.toISOString()}
          fromCache={intel.meta.fromCache}
          stale={intel.meta.stale}
          clientId={ctx.client.id}
          canRefresh={!ctx.user.isGuest}
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {LABEL_ORDER.map((l) => (
          <Link key={l} prefetch={false} href={filter === l ? qs(null) : qs(l)} scroll={false}>
            <Card className={cn("p-4 transition-colors hover:bg-muted/40", filter === l && "ring-2 ring-primary/50")}>
              <div className="text-xs font-medium text-muted-foreground">{CREATIVE_LABEL_TEXT[l]}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{intel.counts[l]}</div>
            </Card>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <CopyCard
          title="Primary text performance"
          description="Ads grouped by their primary text. Best is judged only among texts with at least 1,000 impressions."
          groups={intel.primaryTexts}
          currency={cur}
          efficiency={efficiency}
          cprLabel={cprLabel}
          resultLabel={ctx.settings.primaryConversionLabel}
        />
        <CopyCard
          title="Headline performance"
          description="Ads grouped by headline."
          groups={intel.headlines}
          currency={cur}
          efficiency={efficiency}
          cprLabel={cprLabel}
          resultLabel={ctx.settings.primaryConversionLabel}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Where clicks go</CardTitle>
            <CardDescription>Destination of each ad. &quot;Instant form&quot; means the lead form opens inside Facebook/Instagram.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Destination</TH>
                <TH className="text-right">Ads</TH>
                <TH className="text-right">Spend</TH>
                <TH className="text-right">Link clicks</TH>
                <TH className="text-right">{ctx.settings.primaryConversionLabel}</TH>
                <TH className="text-right">Click → result</TH>
                <TH className="text-right">{cprLabel}</TH>
              </TR>
            </THead>
            <TBody>
              {intel.destinations.map((d) => (
                <TR key={d.key}>
                  <TD className="max-w-96 truncate" title={d.key}>
                    {d.key.startsWith("http") && d.key !== "http://fb.me/" ? (
                      <a href={d.key} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {describeDestination(d.key)}
                      </a>
                    ) : (
                      describeDestination(d.key === "(none)" ? null : d.key)
                    )}
                  </TD>
                  <TD className="text-right">{d.ads}</TD>
                  <TD className="text-right">{formatMetric("spend", d.base.spend, cur)}</TD>
                  <TD className="text-right">{formatMetric("linkClicks", d.base.linkClicks, cur)}</TD>
                  <TD className="text-right">{d.base.results}</TD>
                  <TD className="text-right">{formatMetric("cvr", d.current.cvr, cur)}</TD>
                  <TD className="text-right">{formatMetric("cpr", d.current.cpr, cur)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">
            {filter ? CREATIVE_LABEL_TEXT[filter] : "All ads with delivery"} <span className="text-muted-foreground">({shown.length})</span>
          </h2>
          {filter && (
            <Link prefetch={false} href={qs(null)} className="text-xs text-primary hover:underline">
              Show all
            </Link>
          )}
        </div>
        <div className="space-y-3">
          {shown.map((c) => (
            <AdCard key={c.id} c={c} currency={cur} cprLabel={cprLabel} efficiency={efficiency} />
          ))}
          {!shown.length && <p className="text-sm text-muted-foreground">No ads in this group for the selected period.</p>}
        </div>
      </div>
    </>
  );
}

function CopyCard({
  title,
  description,
  groups,
  currency,
  efficiency,
  cprLabel,
  resultLabel,
}: {
  title: string;
  description: string;
  groups: CopyGroup[];
  currency: string;
  efficiency: "cpr" | "roas";
  cprLabel: string;
  resultLabel: string;
}) {
  const best = bestGroup(groups, efficiency);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        {groups.length === 1 && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            Every ad uses the same text, so there is nothing to compare. See Insights for angles to test.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key} className={cn("rounded-lg border border-border p-3", best === g && "border-good/50 bg-good/5")}>
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-3 whitespace-pre-line text-sm">{g.key}</p>
              {best === g && <Badge variant="good">Best</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>{g.ads} ads</span>
              <span>{formatMetric("spend", g.base.spend, currency)} spend</span>
              <span>
                {g.base.results} {resultLabel.toLowerCase()}
              </span>
              <span>
                {efficiency === "roas" ? `ROAS ${formatMetric("roas", g.current.roas, currency)}` : `${cprLabel} ${formatMetric("cpr", g.current.cpr, currency)}`}
              </span>
              <span>CTR {formatMetric("ctr", g.current.ctr, currency)}</span>
              {!g.enoughData && <span className="text-warning-foreground">low data</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AdCard({ c, currency, cprLabel, efficiency }: { c: CreativeRow; currency: string; cprLabel: string; efficiency: "cpr" | "roas" }) {
  const cur = c.current;
  const prev = c.previous;
  const delta = (k: "ctr" | "cpr" | "frequency" | "roas", dir: "lower_better" | "higher_better" | "neutral") =>
    prev ? compareValues(cur[k], prev[k], dir).pct : null;
  const vr = videoRates(cur.impressions ?? 0, c.creative?.videoViews3s ?? null, c.creative?.thruplays ?? null);
  const rankings = [
    ["Quality", c.creative?.qualityRanking],
    ["Engagement", c.creative?.engagementRanking],
    ["Conversion", c.creative?.conversionRanking],
  ].filter(([, v]) => v && v !== "UNKNOWN") as [string, string][];

  return (
    <Card className="p-4">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
          {c.creative?.thumbnailUrl ? (
            <img src={c.creative.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">No preview</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.name}</span>
            <Badge variant={LABEL_VARIANT[c.label]}>{CREATIVE_LABEL_TEXT[c.label]}</Badge>
            {c.alsoFlags.map((f) => (
              <Badge key={f} variant={LABEL_VARIANT[f]}>
                also: {CREATIVE_LABEL_TEXT[f]}
              </Badge>
            ))}
            {c.status && c.status !== "ACTIVE" && <Badge>{c.status.replace(/_/g, " ").toLowerCase()}</Badge>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {c.campaignName} › {c.adsetName}
            {c.creative?.title && <> · &ldquo;{c.creative.title}&rdquo;</>}
          </div>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-5 lg:grid-cols-9">
            <M label="Spend" v={formatMetric("spend", cur.spend, currency)} sub={`${Math.round(c.spendShare * 100)}% share`} />
            <M label="Impr." v={formatMetric("impressions", cur.impressions, currency)} />
            <M label="Freq." v={formatMetric("frequency", cur.frequency, currency)} sub={formatPct(delta("frequency", "neutral"), 0)} />
            <M label="CTR" v={formatMetric("ctr", cur.ctr, currency)} sub={formatPct(delta("ctr", "higher_better"), 0)} />
            <M label="CPC" v={formatMetric("cpc", cur.cpc, currency)} />
            <M label="CPM" v={formatMetric("cpm", cur.cpm, currency)} />
            <M label="Results" v={formatMetric("results", cur.results, currency)} />
            {efficiency === "roas" ? (
              <M label="ROAS" v={formatMetric("roas", cur.roas, currency)} sub={formatPct(delta("roas", "higher_better"), 0)} />
            ) : (
              <M label={cprLabel} v={formatMetric("cpr", cur.cpr, currency)} sub={formatPct(delta("cpr", "lower_better"), 0)} />
            )}
            {vr.hookRate != null ? (
              <M label="Hook / hold" v={`${Math.round(vr.hookRate * 100)}% / ${vr.holdRate != null ? Math.round(vr.holdRate * 100) : "—"}%`} sub="3s views · ThruPlay" />
            ) : (
              <M label="Format" v="Static" />
            )}
          </dl>
          {rankings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {rankings.map(([k, v]) => (
                <span
                  key={k}
                  className={cn(
                    "rounded px-1.5 py-0.5",
                    v.startsWith("BELOW") ? "bg-critical/10 text-critical" : v === "ABOVE_AVERAGE" ? "bg-good/10 text-good" : "bg-muted text-muted-foreground",
                  )}
                >
                  {k}: {v.replace(/_/g, " ").toLowerCase()}
                </span>
              ))}
            </div>
          )}
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {c.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">
            <span className="font-semibold">Recommendation: </span>
            {c.recommendation}
          </p>
        </div>
      </div>
    </Card>
  );
}

function M({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
      {sub && sub !== "—" && <dd className="text-[10px] text-muted-foreground">{sub}</dd>}
    </div>
  );
}
