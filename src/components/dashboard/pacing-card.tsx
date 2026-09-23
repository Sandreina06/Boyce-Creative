import Link from "next/link";
import type { ClientPacing } from "@/server/services/client-data";
import { PACING_LABEL, type PacingStatus } from "@/server/analytics/pacing";
import { formatPct, formatValue } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const PACING_VARIANT: Record<PacingStatus, "good" | "warning" | "critical" | "default"> = {
  on_track: "good",
  under_pacing: "warning",
  over_pacing: "warning",
  critical: "critical",
  no_budget: "default",
};

export function PacingCard({ pacing, currency, settingsHref }: { pacing: ClientPacing; currency: string; settingsHref: string }) {
  const money = (v: number | null) => formatValue("currency", v, currency);
  const month = new Date(`${pacing.month}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const used = pacing.pctBudgetUsed ?? 0;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Budget pacing</CardTitle>
          <CardDescription>{month} · month to date</CardDescription>
        </div>
        <Badge variant={PACING_VARIANT[pacing.status]}>{PACING_LABEL[pacing.status]}</Badge>
      </CardHeader>
      <CardContent>
        {pacing.status === "no_budget" ? (
          <p className="text-sm text-muted-foreground">
            {money(pacing.spendToDate)} spent this month. No monthly budget set —{" "}
            <Link prefetch={false} className="text-primary hover:underline" href={settingsHref}>
              add one in Settings
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${used.toFixed(0)}% of budget used, ${pacing.pctMonthElapsed.toFixed(0)}% of month elapsed`}>
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(100, used)}%` }} />
              <div className="absolute inset-y-[-2px] w-0.5 bg-foreground" style={{ left: `${Math.min(100, pacing.pctMonthElapsed)}%` }} title="Month elapsed" />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{used.toFixed(0)}% of budget used</span>
              <span>{pacing.pctMonthElapsed.toFixed(0)}% of month elapsed</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Stat label="Monthly budget" value={money(pacing.monthlyBudget)} />
              <Stat label="Spend to date" value={money(pacing.spendToDate)} />
              <Stat label="Expected to date" value={money(pacing.expectedSpendToDate)} />
              <Stat label="Variance" value={`${money(pacing.variance)} (${formatPct(pacing.variancePct)})`} />
              <Stat label="Avg daily spend" value={money(pacing.averageDailySpend)} />
              <Stat label="Required daily" value={money(pacing.requiredDailySpend)} />
              <Stat label="Projected month-end" value={money(pacing.projectedMonthEndSpend)} />
              <Stat label="Projected variance" value={`${money(pacing.projectedVariance)} (${formatPct(pacing.projectedVariancePct)})`} />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
