import type { AttentionThresholds } from "../db/schema";
import { compareValues } from "./compare";
import type { Derived, MetricKey } from "./metrics";
import { PACING_LABEL, type Pacing } from "./pacing";

/**
 * Deterministic "Needs Attention" rules (Phase 1 set).
 * Pure functions: numbers in, alerts out. No LLM involved.
 */

export type AlertSeverity = "critical" | "warning" | "info";

export type Alert = {
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
};

export type AttentionInput = {
  primaryKpi: MetricKey;
  primaryKpiLabel: string;
  resultLabel: string;
  current: Derived;
  previous: Derived | null;
  pacing: Pacing | null;
  thresholds: AttentionThresholds;
  comparisonLabel: string;
  formatValue: (key: MetricKey, v: number | null) => string;
};

const DIRECTION: Partial<Record<MetricKey, "lower_better" | "higher_better">> = {
  cpr: "lower_better",
  cpc: "lower_better",
  cpm: "lower_better",
  roas: "higher_better",
  ctr: "higher_better",
  cvr: "higher_better",
  results: "higher_better",
};

export function evaluateAttention(i: AttentionInput): Alert[] {
  const alerts: Alert[] = [];
  const t = i.thresholds;
  const spend = i.current.spend ?? 0;

  // High spend with no results
  if (spend >= t.minSpend && (i.current.results ?? 0) === 0) {
    alerts.push({
      ruleId: "spend_no_results",
      severity: "critical",
      title: `${i.formatValue("spend", spend)} spent with no ${i.resultLabel.toLowerCase()}`,
      detail: `No ${i.resultLabel.toLowerCase()} recorded in the selected period.`,
    });
  }

  // Primary KPI deterioration
  if (i.previous && spend >= t.minSpend) {
    const dir = DIRECTION[i.primaryKpi] ?? "lower_better";
    const c = compareValues(i.current[i.primaryKpi], i.previous[i.primaryKpi], dir);
    if (c.pct != null && c.sentiment === "bad") {
      const mag = Math.abs(c.pct);
      if (mag >= t.kpiChangeWarnPct) {
        alerts.push({
          ruleId: "primary_kpi_deterioration",
          severity: mag >= t.kpiChangeCriticalPct ? "critical" : "warning",
          title: `${i.primaryKpiLabel} ${c.pct > 0 ? "+" : ""}${c.pct.toFixed(0)}% vs ${i.comparisonLabel}`,
          detail: `${i.formatValue(i.primaryKpi, c.previous)} → ${i.formatValue(i.primaryKpi, c.current)}`,
        });
      }
    }

    // CTR decline while CPM stable → likely creative/audience response, not auction cost
    const ctr = compareValues(i.current.ctr, i.previous.ctr, "higher_better");
    const cpm = compareValues(i.current.cpm, i.previous.cpm, "lower_better");
    if (ctr.pct != null && ctr.pct <= -t.ctrDropWarnPct) {
      const cpmStable = cpm.pct != null && Math.abs(cpm.pct) < 5;
      alerts.push({
        ruleId: "ctr_decline",
        severity: "warning",
        title: `CTR ${ctr.pct.toFixed(0)}%${cpmStable ? " while CPM remained stable" : ""}`,
        detail: `${i.formatValue("ctr", ctr.previous)} → ${i.formatValue("ctr", ctr.current)}; CPM ${
          cpm.pct == null ? "n/a" : `${cpm.pct > 0 ? "+" : ""}${cpm.pct.toFixed(0)}%`
        }`,
      });
    }
  }

  // Budget pacing
  const p = i.pacing;
  if (p && p.status !== "on_track" && p.status !== "no_budget" && p.projectedVariancePct != null) {
    const over = p.projectedVariancePct > 0;
    alerts.push({
      ruleId: "budget_pacing",
      severity: p.status === "critical" ? "critical" : "warning",
      title: `Projected to ${over ? "exceed" : "under-spend"} monthly budget by ${Math.abs(p.projectedVariancePct).toFixed(0)}%`,
      detail: `${PACING_LABEL[p.status]} · projected ${i.formatValue("spend", p.projectedMonthEndSpend)} of ${i.formatValue("spend", p.monthlyBudget)}`,
    });
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
