import type { KpiCard as Kpi } from "@/server/services/client-data";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Delta } from "./delta";

export function KpiCard({ kpi, currency, comparisonLabel }: { kpi: Kpi; currency: string; comparisonLabel: string | null }) {
  const c = kpi.comparison;
  const fmt = (v: number | null) => formatValue(kpi.format, v, currency);
  // Differences of percentages are percentage points, not percent.
  const fmtAbs = (v: number) =>
    kpi.format === "percent" ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)} pp` : `${v > 0 ? "+" : ""}${fmt(v)}`;
  const share = kpi.topContributor?.share;
  return (
    <Card className={cn("flex flex-col p-4", kpi.isPrimary && "ring-2 ring-primary/40")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
        {kpi.isPrimary && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Primary KPI</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{fmt(c.current)}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <Delta c={c} />
        {c.previous != null && (
          <span className="tabular-nums">
            vs {fmt(c.previous)}
            {c.abs != null && ` (${fmtAbs(c.abs)})`}
          </span>
        )}
      </div>
      {kpi.target && (
        <div className={cn("mt-2 text-xs", kpi.target.met ? "text-good" : "text-critical")}>
          Target {fmt(kpi.target.value)} · {kpi.target.met ? "on target" : "off target"}
        </div>
      )}
      {kpi.topContributor && comparisonLabel && (
        <div className="mt-3 border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
          Largest mover:{" "}
          <span className="font-medium text-foreground">{kpi.topContributor.name}</span>{" "}
          <span className="tabular-nums">
            ({fmtAbs(kpi.topContributor.contribution)}
            {/* Shares over 100% happen when other campaigns moved the opposite way; say so instead. */}
            {share != null && (share > 0 && share <= 1 ? `, ${Math.round(share * 100)}% of change` : share > 1 ? ", partly offset by others" : "")})
          </span>
        </div>
      )}
    </Card>
  );
}
