import Link from "next/link";
import { cookies } from "next/headers";
import { AppHeader } from "@/components/shell/app-header";
import { DataStatus } from "@/components/shell/data-status";
import { AttentionList } from "@/components/dashboard/attention-list";
import { Delta } from "@/components/dashboard/delta";
import { PACING_VARIANT } from "@/components/dashboard/pacing-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMetric, formatRelativeTime, formatValue } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { COMPARE_MODES, DATE_PRESETS, DEFAULT_COMPARE, DEFAULT_PRESET } from "@/server/analytics/date-ranges";
import { PACING_LABEL } from "@/server/analytics/pacing";
import { getAgencyOverview } from "@/server/services/agency";
import { LAST_CLIENT_COOKIE } from "@/components/shell/client-switcher";

export default async function AgencyPage(props: PageProps<"/agency">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const overview = await getAgencyOverview(user, params);
  const qs = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  ).toString();
  const href = (id: string) => `/clients/${id}/overview${qs ? `?${qs}` : ""}`;
  const lastClient = (await cookies()).get(LAST_CLIENT_COOKIE)?.value;
  const lastClientRow = overview.rows.find((r) => r.clientId === lastClient);

  const presetLabel = DATE_PRESETS.find((p) => p.id === (params.range ?? DEFAULT_PRESET))?.label ?? "Last 30 days";
  const compareLabel = COMPARE_MODES.find((m) => m.id === (params.compare ?? DEFAULT_COMPARE))?.label ?? "";

  return (
    <>
      <AppHeader user={user} currentClientId={null} />
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agency overview</h1>
            <p className="text-sm text-muted-foreground">
              {overview.rows.length} clients · {presetLabel}
              {params.compare !== "none" && ` vs ${compareLabel.toLowerCase()}`}
              {lastClientRow && (
                <>
                  {" · "}
                  <Link prefetch={false} className="text-primary hover:underline" href={href(lastClientRow.clientId)}>
                    Back to {lastClientRow.name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <DataStatus
            source={overview.meta.source}
            fetchedAt={overview.meta.fetchedAt.toISOString()}
            fromCache={overview.meta.fromCache}
            stale={overview.meta.stale}
            clientId={null}
            canRefresh={!user.isGuest}
          />
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Deterministic checks on each client&apos;s primary KPI, CTR and budget pacing.</CardDescription>
            </div>
            <Badge variant={overview.attention.some((a) => a.alert.severity === "critical") ? "critical" : "default"}>
              {overview.attention.length} alerts
            </Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <AttentionList
              items={overview.attention.map((a, i) => ({ key: `${a.clientId}-${i}`, ...a }))}
              hrefFor={href}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Clients</CardTitle>
              <CardDescription>Budget and pacing are month to date in each client&apos;s timezone.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-2 pt-2">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Client</TH>
                  <TH className="text-right">Spend</TH>
                  <TH className="text-right">Results</TH>
                  <TH className="text-right">Primary KPI</TH>
                  <TH className="text-right">Target</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">ROAS</TH>
                  <TH className="text-right">Monthly budget</TH>
                  <TH className="text-right">Spend MTD</TH>
                  <TH>Pacing</TH>
                  <TH className="text-right">Projected</TH>
                  <TH className="text-right">Active camp.</TH>
                  <TH className="text-right">Alerts</TH>
                  <TH>Last change</TH>
                  <TH>Updated</TH>
                </TR>
              </THead>
              <TBody>
                {overview.rows.map((r) => {
                  const cur = r.currency;
                  return (
                    <TR key={r.clientId}>
                      <TD>
                        <Link prefetch={false} href={href(r.clientId)} className="font-semibold hover:text-primary">
                          {r.name}
                        </Link>
                        {r.error && <div className="text-xs text-critical">{r.error}</div>}
                      </TD>
                      <TD className="text-right">
                        <div>{formatMetric("spend", r.current?.spend, cur)}</div>
                        {r.spendChange && <Delta c={r.spendChange} />}
                      </TD>
                      <TD className="text-right">
                        <div>{formatMetric("results", r.current?.results, cur)}</div>
                        <div className="text-[11px] text-muted-foreground">{r.resultLabel}</div>
                      </TD>
                      <TD className="text-right">
                        <div>
                          <span className="text-[11px] text-muted-foreground">{r.primaryKpi.label} </span>
                          {formatMetric(r.primaryKpi.key, r.primaryKpi.comparison.current, cur)}
                        </div>
                        <Delta c={r.primaryKpi.comparison} />
                      </TD>
                      <TD className="text-right text-muted-foreground">
                        {r.primaryKpi.target != null ? formatMetric(r.primaryKpi.key, r.primaryKpi.target, cur) : "—"}
                      </TD>
                      <TD className="text-right">{r.hasRevenue ? formatMetric("revenue", r.current?.revenue, cur) : "—"}</TD>
                      <TD className="text-right">{r.hasRevenue ? formatMetric("roas", r.current?.roas, cur) : "—"}</TD>
                      <TD className="text-right">{formatValue("currency", r.pacing?.monthlyBudget, cur)}</TD>
                      <TD className="text-right">{formatValue("currency", r.pacing?.spendToDate, cur)}</TD>
                      <TD>
                        {r.pacing ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={PACING_VARIANT[r.pacing.status]}>{PACING_LABEL[r.pacing.status]}</Badge>
                            {r.pacing.pctBudgetUsed != null && (
                              <span className="text-[11px] text-muted-foreground">
                                {r.pacing.pctBudgetUsed.toFixed(0)}% used · {r.pacing.pctMonthElapsed.toFixed(0)}% of month
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD className="text-right">{formatValue("currency", r.pacing?.projectedMonthEndSpend, cur)}</TD>
                      <TD className="text-right">{r.activeCampaigns ?? "—"}</TD>
                      <TD className="text-right">
                        {r.alerts.length ? (
                          <Badge variant={r.alerts.some((a) => a.severity === "critical") ? "critical" : "warning"}>
                            {r.alerts.length}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TD>
                      <TD className="max-w-48 truncate text-xs text-muted-foreground" title={r.lastChange?.action}>
                        {r.lastChange ? `${formatRelativeTime(r.lastChange.changedAt)} · ${r.lastChange.action}` : "None logged"}
                      </TD>
                      <TD className="text-xs text-muted-foreground">{r.meta ? formatRelativeTime(r.meta.fetchedAt) : "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
