import { compareValues } from "./compare";
import type { CreativeAssessment } from "./creative";
import { derive, type BaseMetrics, type Derived } from "./metrics";
import type { Pacing } from "./pacing";

/**
 * Account health: deterministic issue detection with evidence and
 * rule-based recommendations. No LLM is involved. Wording never claims
 * causation — only what the numbers show and what is worth checking.
 */

export type IssueSeverity = "critical" | "warning" | "opportunity" | "info";
export type IssueCategory = "performance" | "budget" | "creative" | "structure" | "delivery" | "tracking" | "strategy";

export type Issue = {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  evidence: string[];
  recommendation: string;
  entity?: { type: "campaign" | "adset" | "ad"; id: string; name: string };
};

export type HealthCampaign = { id: string; name: string; status: string | null; current: BaseMetrics; previous: BaseMetrics | null };
export type HealthAdset = {
  id: string;
  name: string;
  campaignName: string;
  status: string | null;
  learningStage: string | null;
  current: BaseMetrics;
  /** Active ads with delivery in the period, with their spend. */
  ads: { id: string; name: string; spend: number }[];
};

export type HealthInput = {
  resultLabel: string;
  primaryKpiLabel: string;
  efficiency: "cpr" | "roas";
  current: BaseMetrics;
  previous: BaseMetrics | null;
  comparisonLabel: string;
  rangeDays: number;
  campaigns: HealthCampaign[];
  adsets: HealthAdset[];
  creatives: (CreativeAssessment & { name: string; status: string | null })[];
  /** Daily totals in the period (complete days), oldest first. */
  daily: { date: string; spend: number; results: number }[];
  pacing: Pacing | null;
  fmt: { money: (v: number | null) => string; pct: (v: number | null) => string };
};

export type HealthRules = {
  kpiWarnPct: number;
  kpiCriticalPct: number;
  kpiImprovePct: number;
  campaignNoResultMultiple: number;
  topAdShare: number;
  accountFrequencyHigh: number;
  trackingQuietDays: number;
  minSpend: number;
};

export const DEFAULT_HEALTH_RULES: HealthRules = {
  kpiWarnPct: 20,
  kpiCriticalPct: 35,
  kpiImprovePct: 15,
  campaignNoResultMultiple: 1.5,
  topAdShare: 0.8,
  accountFrequencyHigh: 3.5,
  trackingQuietDays: 3,
  minSpend: 50,
};

/** Meta's documented guideline: ~50 optimization events per ad set per week to exit learning. */
const LEARNING_EVENTS_PER_WEEK = 50;

/**
 * Split the log-change of cost per result into CPM, CTR and CVR components.
 * CPR = (CPM/1000)/(CTR×CVR) ⇒ Δln CPR = Δln CPM − Δln CTR − Δln CVR (exact).
 * Returns each component's share of the total change (sums to 1).
 */
export function decomposeCpr(cur: Derived, prev: Derived) {
  const ln = (a: number | null, b: number | null) => (a && b && a > 0 && b > 0 ? Math.log(a / b) : null);
  const cpm = ln(cur.cpm, prev.cpm);
  const ctr = ln(cur.ctr, prev.ctr);
  const cvr = ln(cur.cvr, prev.cvr);
  const total = ln(cur.cpr, prev.cpr);
  if (cpm == null || ctr == null || cvr == null || total == null || total === 0) return null;
  const parts = [
    { driver: "CPM" as const, contribution: cpm },
    { driver: "CTR" as const, contribution: -ctr },
    { driver: "CVR" as const, contribution: -cvr },
  ].map((p) => ({ ...p, share: p.contribution / total }));
  return {
    parts,
    dominant: [...parts].sort((a, b) => b.share - a.share)[0],
    pct: {
      cpm: compareValues(cur.cpm, prev.cpm, "neutral").pct,
      ctr: compareValues(cur.ctr, prev.ctr, "neutral").pct,
      cvr: compareValues(cur.cvr, prev.cvr, "neutral").pct,
    },
  };
}

const DRIVER_RECOMMENDATION = {
  CTR: "The largest mathematical driver is lower click-through. Review the ads with the biggest CTR drops (see Creative) and refresh hooks, first frames and headlines.",
  CPM: "The largest mathematical driver is higher CPM (more expensive delivery). Check for audience saturation or narrow targeting, try broader or Advantage+ placements, and compare against seasonal auction costs.",
  CVR: "The largest mathematical driver is lower conversion rate after the click. Check the landing page or lead form (speed, friction, offer match) and confirm tracking is still firing.",
} as const;

export function evaluateHealth(i: HealthInput, rules: HealthRules = DEFAULT_HEALTH_RULES): Issue[] {
  const issues: Issue[] = [];
  const cur = derive(i.current);
  const prev = i.previous ? derive(i.previous) : null;
  const result1 = i.resultLabel.toLowerCase().replace(/s$/, "");
  const results = i.resultLabel.toLowerCase();
  const pct = (v: number | null) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`);

  // 1. Primary KPI movement + driver decomposition -----------------------------
  if (prev && i.current.spend >= rules.minSpend) {
    if (i.efficiency === "cpr") {
      const c = compareValues(cur.cpr, prev.cpr, "lower_better");
      if (c.pct != null && c.pct >= rules.kpiWarnPct) {
        const d = decomposeCpr(cur, prev);
        issues.push({
          id: "kpi_deterioration",
          severity: c.pct >= rules.kpiCriticalPct ? "critical" : "warning",
          category: "performance",
          title: `${i.primaryKpiLabel} up ${c.pct.toFixed(0)}% vs ${i.comparisonLabel}`,
          evidence: [
            `${i.primaryKpiLabel} ${i.fmt.money(c.previous)} → ${i.fmt.money(c.current)}`,
            ...(d ? [`CPM ${pct(d.pct.cpm)} · CTR ${pct(d.pct.ctr)} · CVR ${pct(d.pct.cvr)}`,
              `Largest contributing movement: ${d.dominant.driver} (${Math.round(d.dominant.share * 100)}% of the change, mathematically)`] : []),
          ],
          recommendation: d ? DRIVER_RECOMMENDATION[d.dominant.driver] : "Review the campaigns with the largest cost increases on the Overview.",
        });
      } else if (c.pct != null && c.pct <= -rules.kpiImprovePct && i.current.results >= 5) {
        issues.push({
          id: "kpi_improvement",
          severity: "opportunity",
          category: "performance",
          title: `${i.primaryKpiLabel} improved ${Math.abs(c.pct).toFixed(0)}% vs ${i.comparisonLabel}`,
          evidence: [`${i.primaryKpiLabel} ${i.fmt.money(c.previous)} → ${i.fmt.money(c.current)} on ${i.current.results} ${results}`],
          recommendation:
            "Efficiency has room to absorb more budget. If pacing allows, consider raising budgets on the best campaigns in steps of about 20% every few days while watching cost per result.",
        });
      }
    } else {
      const c = compareValues(cur.roas, prev.roas, "higher_better");
      if (c.pct != null && c.pct <= -rules.kpiWarnPct) {
        issues.push({
          id: "roas_decline",
          severity: c.pct <= -rules.kpiCriticalPct ? "critical" : "warning",
          category: "performance",
          title: `ROAS down ${Math.abs(c.pct).toFixed(0)}% vs ${i.comparisonLabel}`,
          evidence: [`ROAS ${prev.roas?.toFixed(2)}x → ${cur.roas?.toFixed(2)}x`, `CPM ${pct(compareValues(cur.cpm, prev.cpm, "neutral").pct)} · CTR ${pct(compareValues(cur.ctr, prev.ctr, "neutral").pct)} · CVR ${pct(compareValues(cur.cvr, prev.cvr, "neutral").pct)}`],
          recommendation: "Check which campaigns lost the most revenue per dollar on the Overview, then review their top ads and landing pages.",
        });
      }
    }
  }

  // 2. Campaigns spending without results ------------------------------------------
  const accCpr = cur.cpr;
  for (const c of i.campaigns) {
    const threshold = Math.max(rules.minSpend, (accCpr ?? 0) * rules.campaignNoResultMultiple);
    if (c.current.results === 0 && c.current.spend >= threshold) {
      issues.push({
        id: `campaign_no_results:${c.id}`,
        severity: "critical",
        category: "budget",
        title: `${c.name}: ${i.fmt.money(c.current.spend)} spent with no ${results}`,
        evidence: [
          `${c.current.impressions.toLocaleString("en-US")} impressions · ${c.current.linkClicks} link clicks · 0 ${results}`,
          ...(accCpr ? [`Account cost per ${result1}: ${i.fmt.money(accCpr)}`] : []),
        ],
        recommendation:
          c.current.linkClicks > 20
            ? `Clicks are arriving but not converting. Confirm this campaign optimizes for the same ${result1} event, then check the landing page or form. If it is intentionally a traffic/awareness campaign, ignore this.`
            : "Very little response. Review targeting and creative, or pause it and move its budget to campaigns that are producing results.",
        entity: { type: "campaign", id: c.id, name: c.name },
      });
    }
  }

  // 3. Learning status ---------------------------------------------------------------
  for (const a of i.adsets) {
    if (a.status !== "ACTIVE" || a.current.spend <= 0) continue;
    const weekly = (a.current.results / Math.max(1, i.rangeDays)) * 7;
    if (a.learningStage === "FAIL") {
      issues.push({
        id: `learning_limited:${a.id}`,
        severity: "warning",
        category: "delivery",
        title: `${a.name}: Learning limited`,
        evidence: [
          `${a.campaignName} › ${a.name}`,
          `≈${weekly.toFixed(1)} ${results} per week vs Meta's guideline of ~${LEARNING_EVENTS_PER_WEEK} optimization events per week`,
        ],
        recommendation:
          "Delivery is not stable. Consider consolidating similar ad sets, broadening the audience, raising the budget, or optimizing for a higher-volume event so the ad set can exit learning.",
        entity: { type: "adset", id: a.id, name: a.name },
      });
    }
  }
  // Ad sets still learning: one grouped note rather than one per ad set.
  const learning = i.adsets.filter((a) => a.status === "ACTIVE" && a.current.spend > 0 && a.learningStage === "LEARNING");
  if (learning.length) {
    issues.push({
      id: "learning",
      severity: "info",
      category: "delivery",
      title: `${learning.length} ad set${learning.length > 1 ? "s" : ""} still in the learning phase`,
      evidence: learning
        .slice(0, 5)
        .map((a) => `${a.name}: ≈${((a.current.results / Math.max(1, i.rangeDays)) * 7).toFixed(1)} ${results} per week`),
      recommendation:
        "Avoid significant edits (budget, targeting, creative) until they exit learning; each edit restarts it. If volume stays far below ~50 events a week, consolidating ad sets will help more than waiting.",
    });
  }

  // 4. Creative structure in each ad set ----------------------------------------------
  for (const a of i.adsets) {
    if (a.status !== "ACTIVE" || !a.ads.length) continue;
    const total = a.ads.reduce((s, x) => s + x.spend, 0);
    const top = [...a.ads].sort((x, y) => y.spend - x.spend)[0];
    if (a.ads.length === 1 && a.current.spend >= rules.minSpend) {
      issues.push({
        id: `single_ad:${a.id}`,
        severity: "warning",
        category: "structure",
        title: `${a.name}: only one ad with delivery`,
        evidence: [`${top.name} received all ${i.fmt.money(total)}`],
        recommendation: "There is no creative test running. Add 2–3 variants (different hook or format) so Meta can find a better performer and you have a replacement when it fatigues.",
        entity: { type: "adset", id: a.id, name: a.name },
      });
    } else if (total > 0 && top.spend / total >= rules.topAdShare) {
      issues.push({
        id: `ad_concentration:${a.id}`,
        severity: "info",
        category: "structure",
        title: `${a.name}: ${Math.round((top.spend / total) * 100)}% of spend on one ad`,
        evidence: [`${top.name}: ${i.fmt.money(top.spend)} of ${i.fmt.money(total)} across ${a.ads.length} ads`],
        recommendation:
          "Meta is concentrating delivery on one ad, so the others are barely tested. That is fine if it is your best ad; if you need a real test, run the challengers in a separate ad set or pause the leader for a short test.",
        entity: { type: "adset", id: a.id, name: a.name },
      });
    }
  }

  // 5. Creative labels ---------------------------------------------------------------
  const fatigued = i.creatives.filter((c) => c.label === "fatigue" && (c.status == null || c.status === "ACTIVE"));
  if (fatigued.length) {
    issues.push({
      id: "creative_fatigue",
      severity: "warning",
      category: "creative",
      title: `${fatigued.length} ad${fatigued.length > 1 ? "s" : ""} showing creative fatigue`,
      evidence: fatigued.slice(0, 3).map((c) => `${c.name}: ${c.evidence.join("; ")}`),
      recommendation: "Prepare replacement creative for these ads (new hooks on the same message) and rotate it in before efficiency declines further.",
    });
  }
  // Only active ads are actionable; paused ones are already handled.
  const under = i.creatives.filter((c) => c.label === "underperformer" && (c.status == null || c.status === "ACTIVE"));
  const underSpend = under.reduce((s, c) => s + (c.current.spend ?? 0), 0);
  if (under.length && i.current.spend && underSpend / i.current.spend >= 0.1) {
    issues.push({
      id: "creative_underperformers",
      severity: underSpend / i.current.spend >= 0.25 ? "critical" : "warning",
      category: "creative",
      title: `${Math.round((underSpend / i.current.spend) * 100)}% of spend on active underperforming ads`,
      evidence: under.slice(0, 3).map((c) => `${c.name}: ${c.evidence[0]}`),
      recommendation: "Consider pausing these ads and letting budget flow to the account's more efficient ads.",
    });
  }
  const scale = i.creatives.filter(
    (c) => (c.label === "scaling_candidate" || c.alsoFlags.includes("scaling_candidate")) && (c.status == null || c.status === "ACTIVE"),
  );
  if (scale.length) {
    issues.push({
      id: "creative_scaling",
      severity: "opportunity",
      category: "creative",
      title: `${scale.length} efficient ad${scale.length > 1 ? "s" : ""} getting little budget`,
      evidence: scale.slice(0, 3).map((c) => `${c.name}: ${c.evidence[0]}`),
      recommendation: "Give these ads more delivery: duplicate them into a scaling ad set, or pause weaker ads beside them.",
    });
  }

  // 6. Audience saturation --------------------------------------------------------------
  if (cur.frequency != null && cur.frequency >= rules.accountFrequencyHigh && i.current.spend >= rules.minSpend) {
    issues.push({
      id: "high_frequency",
      severity: "warning",
      category: "delivery",
      title: `Average frequency ${cur.frequency.toFixed(1)} over ${i.rangeDays} days`,
      evidence: [`${i.current.reach?.toLocaleString("en-US")} people reached ${cur.frequency.toFixed(1)} times on average`],
      recommendation: "The audience is seeing the ads often. Consider broadening targeting or geography and rotating in new creative to avoid saturation.",
    });
  }

  // 7. Possible tracking break --------------------------------------------------------
  const days = i.daily;
  const n = rules.trackingQuietDays;
  if (days.length >= n + 7) {
    const recent = days.slice(-n);
    const before = days.slice(-(n + 7), -n);
    const beforeRate = before.reduce((s, d) => s + d.results, 0) / before.length;
    const recentSpend = recent.reduce((s, d) => s + d.spend, 0);
    const beforeSpend = before.reduce((s, d) => s + d.spend, 0) / before.length;
    if (recent.every((d) => d.results === 0) && beforeRate >= 1 && recentSpend >= beforeSpend * n * 0.5) {
      issues.push({
        id: "tracking_gap",
        severity: "critical",
        category: "tracking",
        title: `No ${results} recorded in the last ${n} days`,
        evidence: [`Before that: ≈${beforeRate.toFixed(1)} ${results}/day`, `Spend continued: ${i.fmt.money(recentSpend)} in the last ${n} days`],
        recommendation:
          "A sudden stop with steady spend often points to tracking. Check the pixel/Conversions API events in Events Manager, test the lead form or thank-you page, and confirm nothing changed on the website.",
      });
    }
  }

  // 8. Budget pacing ---------------------------------------------------------------
  const p = i.pacing;
  if (p && p.status !== "on_track" && p.status !== "no_budget" && p.projectedVariancePct != null) {
    const over = p.projectedVariancePct > 0;
    issues.push({
      id: "pacing",
      severity: p.status === "critical" ? "critical" : "warning",
      category: "budget",
      title: `Projected to ${over ? "overspend" : "underspend"} the monthly budget by ${Math.abs(p.projectedVariancePct).toFixed(0)}%`,
      evidence: [
        `Spent ${i.fmt.money(p.spendToDate)} of ${i.fmt.money(p.monthlyBudget)} with ${p.daysRemaining} days left`,
        `Average ${i.fmt.money(p.averageDailySpend)}/day; ${i.fmt.money(p.requiredDailySpend)}/day needed to land on budget`,
      ],
      recommendation: over
        ? `Lower daily budgets to about ${i.fmt.money(p.requiredDailySpend)}/day in total, trimming the least efficient campaigns first.`
        : `Raise daily budgets to about ${i.fmt.money(p.requiredDailySpend)}/day in total, adding to the most efficient campaigns first.`,
    });
  }

  const order: Record<IssueSeverity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
