import Link from "next/link";
import { IssueList } from "@/components/dashboard/issue-list";
import { DataStatus } from "@/components/shell/data-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import { requireClientAccess } from "@/server/auth/access";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { getClientIntelligence } from "@/server/services/intelligence";

const LEAD_METHOD: Record<string, string> = {
  instant_form: "Meta instant forms",
  website: "Website (pixel)",
  mixed: "Instant forms + website",
  traffic: "Traffic to website",
  other: "Other",
};

export default async function InsightsPage(props: PageProps<"/clients/[clientId]/insights">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;

  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const intelR = await settle(getClientIntelligence(ctx, dates));
  if (!intelR.ok) return <SectionError title="Issues & recommendations" message={intelR.error} />;
  const intel = intelR.data;
  const s = ctx.settings;
  const b = intel.benchmark;
  const cur = s.currency;
  const counts = {
    critical: intel.issues.filter((i) => i.severity === "critical").length,
    warning: intel.issues.filter((i) => i.severity === "warning").length,
    opportunity: intel.issues.filter((i) => i.severity === "opportunity").length,
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
          {dates.comparison && ` vs ${formatRange(dates.comparison)}`}
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Issues &amp; recommendations</CardTitle>
              <CardDescription>
                Calculated from the account data, this client&apos;s context and published benchmarks. Performance that changes after an
                optimization doesn&apos;t prove the optimization caused it.
              </CardDescription>
            </div>
            <div className="flex gap-1.5">
              {counts.critical > 0 && <Badge variant="critical">{counts.critical} critical</Badge>}
              {counts.warning > 0 && <Badge variant="warning">{counts.warning} warnings</Badge>}
              {counts.opportunity > 0 && <Badge variant="good">{counts.opportunity} opportunities</Badge>}
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <IssueList issues={intel.issues} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Client context</CardTitle>
                <CardDescription>Used to tailor recommendations{ctx.user.isGuest ? "" : " · edit in Settings"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-sm">
              <Row k="Industry" v={b.label} />
              <Row k="Leads captured via" v={s.leadMethod ? LEAD_METHOD[s.leadMethod] : "Not set"} />
              <Row k="Service area" v={s.serviceArea ?? "Not set"} />
              {s.website && (
                <Row
                  k="Website"
                  v={
                    <a href={s.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {s.website.replace(/^https?:\/\//, "")}
                    </a>
                  }
                />
              )}
              {s.contextNotes && <p className="whitespace-pre-line pt-1 text-xs text-muted-foreground">{s.contextNotes}</p>}
              {!s.industry && !ctx.user.isGuest && (
                <Link prefetch={false} href={`/clients/${clientId}/settings`} className="text-xs text-primary hover:underline">
                  Add context in Settings →
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Benchmarks: {b.label}</CardTitle>
                <CardDescription>Third-party averages, used as a sanity check rather than a target</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-sm">
              {b.cpl && (
                <Row
                  k="Cost per lead"
                  v={b.cpl.low != null && b.cpl.high != null ? `${formatMetric("spend", b.cpl.low, cur)}–${formatMetric("spend", b.cpl.high, cur)}` : `≈${formatMetric("spend", b.cpl.typical, cur)}`}
                />
              )}
              {b.leadCtr != null && <Row k="Lead ads CTR" v={formatMetric("ctr", b.leadCtr, cur)} />}
              {b.leadCvr != null && <Row k="Lead ads CVR" v={formatMetric("cvr", b.leadCvr, cur)} />}
              {b.trafficCtr != null && <Row k="Traffic CTR" v={formatMetric("ctr", b.trafficCtr, cur)} />}
              {b.trafficCpc != null && <Row k="Traffic CPC" v={formatMetric("cpc", b.trafficCpc, cur)} />}
              {b.facts.length > 0 && (
                <ul className="list-disc space-y-1 pl-4 pt-1 text-xs text-muted-foreground">
                  {b.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Sources:{" "}
                {b.sources.map((src, k) => (
                  <span key={src.url}>
                    {k > 0 && " · "}
                    <a href={src.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                      {src.title}
                    </a>
                  </span>
                ))}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
