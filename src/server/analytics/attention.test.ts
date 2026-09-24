import { describe, expect, it } from "vitest";
import { evaluateAttention } from "./attention";
import { derive } from "./metrics";

const T = { kpiChangeWarnPct: 20, kpiChangeCriticalPct: 35, ctrDropWarnPct: 20, minSpend: 50 };
const fmt = (_k: string, v: number | null) => String(v);

describe("evaluateAttention", () => {
  it("raises a critical CPL alert and a CTR-with-stable-CPM warning", () => {
    const prev = derive({ spend: 1000, impressions: 50000, clicks: 900, linkClicks: 600, reach: null, results: 20, revenue: null });
    const cur = derive({ spend: 1000, impressions: 50500, clicks: 700, linkClicks: 450, reach: null, results: 14, revenue: null });
    const alerts = evaluateAttention({
      primaryKpi: "cpr", primaryKpiLabel: "CPL", resultLabel: "Leads", current: cur, previous: prev,
      pacing: null, thresholds: T, comparisonLabel: "previous period", formatValue: fmt,
    });
    expect(alerts[0]).toMatchObject({ ruleId: "primary_kpi_deterioration", severity: "critical" });
    expect(alerts.find((a) => a.ruleId === "ctr_decline")?.title).toMatch(/CPM remained stable/);
  });
  it("flags spend with zero results", () => {
    const cur = derive({ spend: 200, impressions: 9000, clicks: 50, linkClicks: 30, reach: null, results: 0, revenue: null });
    const alerts = evaluateAttention({
      primaryKpi: "cpr", primaryKpiLabel: "CPL", resultLabel: "Leads", current: cur, previous: null,
      pacing: null, thresholds: T, comparisonLabel: "previous period", formatValue: fmt,
    });
    expect(alerts.map((a) => a.ruleId)).toEqual(["spend_no_results"]);
  });
});

describe("mergeAlerts", () => {
  it("adds deep issues, drops info and duplicate basic checks", async () => {
    const { mergeAlerts } = await import("./attention");
    const merged = mergeAlerts(
      [
        { ruleId: "primary_kpi_deterioration", severity: "warning", title: "CPL +25%", detail: "" },
        { ruleId: "ctr_decline", severity: "warning", title: "CTR -30%", detail: "" },
      ],
      [
        { id: "kpi_deterioration", severity: "warning", title: "CPL up 25%", evidence: ["a", "b", "c"], recommendation: "r" },
        { id: "learning_limited:1", severity: "warning", title: "Golf - Broad: Learning limited", evidence: ["x"], recommendation: "r" },
        { id: "no_copy_test", severity: "warning", title: "Same primary text", evidence: [], recommendation: "r" },
        { id: "learning", severity: "info", title: "still learning", evidence: [], recommendation: "r" },
        { id: "instant_form_quality", severity: "opportunity", title: "protect lead quality", evidence: [], recommendation: "r" },
      ],
    );
    expect(merged.map((a) => a.ruleId)).toEqual(["kpi_deterioration", "learning_limited:1", "no_copy_test", "ctr_decline", "instant_form_quality"]);
    expect(merged[0].detail).toBe("a · b");
  });
});
