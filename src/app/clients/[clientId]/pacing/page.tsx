import Link from "next/link";
import { PacingChart } from "@/components/charts/pacing-chart";
import { PacingCard } from "@/components/dashboard/pacing-card";
import { PageStatus } from "@/components/dashboard/page-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMetric } from "@/lib/format";
import { dateQuery } from "@/lib/qs";
import { requireClientAccess } from "@/server/auth/access";
import { getPacingDetail } from "@/server/services/client-data";

export default async function PacingPage(props: PageProps<"/clients/[clientId]/pacing">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;
  const r = await settle(getPacingDetail(ctx));
  if (!r.ok) return <SectionError title="Budget pacing" message={r.error} />;
  const { pacing, cumulative, campaigns, activeDailyBudgets, meta } = r.data;
  const cur = ctx.settings.currency;
  const money = (v: number | null) => formatMetric("spend", v, cur);
  const month = new Date(`${pacing.month}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const need = pacing.requiredDailySpend;
  const budgetGap = need != null && activeDailyBudgets > 0 ? (activeDailyBudgets - need) / need : null;

  return (
    <>
      <PageStatus
        left={
          <>
            <span className="font-medium text-foreground">{month}</span> · month to date in {ctx.settings.timezone} (pacing always uses the current
            month, whatever date range is selected)
          </>
        }
        meta={meta}
        clientId={ctx.client.id}
        canRefresh={!ctx.user.isGuest}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Spend vs budget</CardTitle>
              <CardDescription>Cumulative spend each day compared with an even pace to the monthly budget</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PacingChart data={cumulative} currency={cur} />
          </CardContent>
        </Card>
        <PacingCard pacing={pacing} currency={cur} settingsHref={`/clients/${clientId}/settings`} />
      </div>

      {pacing.monthlyBudget != null && need != null && (
        <Card>
          <CardContent className="pt-5 text-sm">
            <p>
              To land on {money(pacing.monthlyBudget)}, the account needs about <span className="font-semibold">{money(need)}/day</span> for the
              remaining {pacing.daysRemaining} days (it has averaged {money(pacing.averageDailySpend)}/day so far).
              {activeDailyBudgets > 0 && (
                <>
                  {" "}
                  Active campaign daily budgets in Meta add up to <span className="font-semibold">{money(activeDailyBudgets)}/day</span>
                  {budgetGap != null && Math.abs(budgetGap) >= 0.1 && (
                    <>
                      {" "}
                      —{" "}
                      <span className={budgetGap > 0 ? "text-critical" : "text-warning-foreground"}>
                        {Math.abs(Math.round(budgetGap * 100))}% {budgetGap > 0 ? "above" : "below"} what&apos;s needed
                      </span>
                      . Consider {budgetGap > 0 ? "lowering" : "raising"} them, starting with the {budgetGap > 0 ? "least" : "most"} efficient campaigns.
                    </>
                  )}
                  {budgetGap != null && Math.abs(budgetGap) < 0.1 && <> — in line with what&apos;s needed.</>}
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Ad set level budgets (ABO) are not included in the campaign budget total.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Spend by campaign this month</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Campaign</TH>
                <TH className="text-right">Daily budget</TH>
                <TH className="text-right">Spend MTD</TH>
                <TH className="text-right">Avg / day</TH>
                <TH className="text-right">Share</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link prefetch={false} href={`/clients/${clientId}/campaigns/${c.id}?${dateQuery(params)}`} className="font-medium hover:text-primary">
                      {c.name}
                    </Link>{" "}
                    {c.status && <Badge variant={c.status === "ACTIVE" ? "good" : "default"}>{c.status.toLowerCase().replace(/_/g, " ")}</Badge>}
                  </TD>
                  <TD className="text-right">{c.dailyBudget ? money(c.dailyBudget) : <span className="text-muted-foreground">ad set level</span>}</TD>
                  <TD className="text-right">{money(c.spend)}</TD>
                  <TD className="text-right">{money(c.avgDaily)}</TD>
                  <TD className="text-right">{Math.round(c.share * 100)}%</TD>
                </TR>
              ))}
              {!campaigns.length && (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-muted-foreground">
                    No spend yet this month.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
