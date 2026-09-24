import { compareValues } from "./compare";
import { derive, type BaseMetrics, type Derived } from "./metrics";

/**
 * Deterministic creative (ad-level) classification.
 *
 * Every label is backed by explicit evidence. Fatigue always needs a
 * performance signal (CTR ↓ or cost per result ↑) in addition to exposure
 * (frequency) — high frequency alone is never called fatigue.
 */

export type CreativeLabel = "winner" | "scaling_candidate" | "fatigue" | "underperformer" | "stable" | "low_data";

export type EfficiencyMetric = "cpr" | "roas";

export type CreativeRules = {
  /** Below this many impressions an ad is "low data" and never judged. */
  minImpressions: number;
  /** Fatigue: frequency rise (%) that counts as an exposure signal. */
  freqRisePct: number;
  /** Fatigue: absolute frequency that counts as an exposure signal on its own. */
  freqHigh: number;
  /** Fatigue: CTR drop (%) signal. */
  ctrDropPct: number;
  /** Fatigue: cost-per-result rise (%) signal (ROAS drop for ROAS clients). */
  effDeclinePct: number;
  /** Winner: efficiency at least this much better than the account (0.2 = 20%). */
  winnerEdge: number;
  winnerMinResults: number;
  winnerMinSpendShare: number;
  /** Scaling candidate: efficient but receiving less than this share of spend. */
  scalingMaxSpendShare: number;
  scalingMaxFrequency: number;
  scalingMinResults: number;
  /** Underperformer: cost per result at least this multiple of the account's. */
  underMultiple: number;
};

export const DEFAULT_CREATIVE_RULES: CreativeRules = {
  minImpressions: 1000,
  freqRisePct: 20,
  freqHigh: 3.5,
  ctrDropPct: 15,
  effDeclinePct: 20,
  winnerEdge: 0.2,
  winnerMinResults: 3,
  winnerMinSpendShare: 0.1,
  scalingMaxSpendShare: 0.1,
  scalingMaxFrequency: 2.5,
  scalingMinResults: 2,
  underMultiple: 1.5,
};

export type CreativeInput = {
  id: string;
  status: string | null;
  current: BaseMetrics;
  previous: BaseMetrics | null;
};

export type CreativeAssessment = {
  id: string;
  label: CreativeLabel;
  /** Secondary labels that also apply (e.g. a winner that is starting to fatigue). */
  alsoFlags: CreativeLabel[];
  current: Derived;
  previous: Derived | null;
  spendShare: number;
  evidence: string[];
  recommendation: string;
};

export type AccountBaseline = { current: Derived; efficiency: EfficiencyMetric };

type Fmt = { money: (v: number | null) => string; pct: (v: number | null) => string };

const pctChange = (cur: number | null, prev: number | null) => compareValues(cur, prev, "neutral").pct;

export function assessCreative(
  ad: CreativeInput,
  baseline: AccountBaseline,
  totalSpend: number,
  fmt: Fmt,
  resultLabel: string,
  rules: CreativeRules = DEFAULT_CREATIVE_RULES,
): CreativeAssessment {
  const cur = derive(ad.current);
  const prev = ad.previous ? derive(ad.previous) : null;
  const spendShare = totalSpend ? ad.current.spend / totalSpend : 0;
  const results = ad.current.results;
  const acc = baseline.current;
  const useRoas = baseline.efficiency === "roas";
  const result1 = resultLabel.toLowerCase().replace(/s$/, "");

  const base = { id: ad.id, current: cur, previous: prev, spendShare };

  if (ad.current.impressions < rules.minImpressions) {
    return {
      ...base,
      label: "low_data",
      alsoFlags: [],
      evidence: [`${ad.current.impressions.toLocaleString("en-US")} impressions — below the ${rules.minImpressions.toLocaleString("en-US")} needed to judge.`],
      recommendation: "Not enough delivery to judge yet. Leave it running or check why it is not getting delivery.",
    };
  }

  // --- Signals --------------------------------------------------------------
  const evidence: string[] = [];
  const flags = new Set<CreativeLabel>();

  // Fatigue: exposure signal + at least one performance signal
  const freqChange = prev ? pctChange(cur.frequency, prev.frequency) : null;
  const exposure =
    (cur.frequency != null && cur.frequency >= rules.freqHigh) ||
    (freqChange != null && freqChange >= rules.freqRisePct && (cur.frequency ?? 0) >= 2);
  const ctrChange = prev && ad.previous!.impressions >= rules.minImpressions / 2 ? pctChange(cur.ctr, prev.ctr) : null;
  const ctrDown = ctrChange != null && ctrChange <= -rules.ctrDropPct;
  const effChange = prev ? pctChange(useRoas ? cur.roas : cur.cpr, useRoas ? prev.roas : prev.cpr) : null;
  const effDown =
    effChange != null && (useRoas ? effChange <= -rules.effDeclinePct : effChange >= rules.effDeclinePct);

  if (exposure && (ctrDown || effDown)) {
    flags.add("fatigue");
    evidence.push(
      `Frequency ${fmtNum(prev?.frequency)} → ${fmtNum(cur.frequency)}${freqChange != null ? ` (${signed(freqChange)})` : ""}`,
    );
    if (ctrDown) evidence.push(`CTR ${fmt.pct(prev!.ctr)} → ${fmt.pct(cur.ctr)} (${signed(ctrChange!)})`);
    if (effDown)
      evidence.push(
        useRoas
          ? `ROAS ${fmtNum(prev!.roas)}x → ${fmtNum(cur.roas)}x (${signed(effChange!)})`
          : `Cost per ${result1} ${fmt.money(prev!.cpr)} → ${fmt.money(cur.cpr)} (${signed(effChange!)})`,
      );
  }

  // Efficiency vs account
  const accEff = useRoas ? acc.roas : acc.cpr;
  const adEff = useRoas ? cur.roas : cur.cpr;
  const ratio = accEff && adEff != null ? adEff / accEff : null; // for CPR lower is better; for ROAS higher is better
  const better = ratio != null && (useRoas ? ratio >= 1 + rules.winnerEdge : ratio <= 1 - rules.winnerEdge);

  // Underperformer
  if (!useRoas && acc.cpr) {
    if (results === 0 && ad.current.spend >= acc.cpr * rules.underMultiple) {
      flags.add("underperformer");
      evidence.push(
        `${fmt.money(ad.current.spend)} spent with no ${resultLabel.toLowerCase()} (account cost per ${result1}: ${fmt.money(acc.cpr)})`,
      );
    } else if (results > 0 && ratio != null && ratio >= rules.underMultiple) {
      flags.add("underperformer");
      evidence.push(`Cost per ${result1} ${fmt.money(cur.cpr)} is ${ratio.toFixed(1)}× the account's ${fmt.money(acc.cpr)}`);
    }
  } else if (useRoas && acc.roas && cur.roas != null && cur.roas <= acc.roas / rules.underMultiple && ad.current.spend > 0) {
    flags.add("underperformer");
    evidence.push(`ROAS ${fmtNum(cur.roas)}x vs account ${fmtNum(acc.roas)}x`);
  }

  // Winner / scaling candidate
  if (better && !flags.has("underperformer")) {
    const edge = useRoas ? `ROAS ${fmtNum(cur.roas)}x vs account ${fmtNum(acc.roas)}x` : `Cost per ${result1} ${fmt.money(cur.cpr)} vs account ${fmt.money(acc.cpr)} (${signed((ratio! - 1) * 100)})`;
    if (results >= rules.winnerMinResults && spendShare >= rules.winnerMinSpendShare) {
      flags.add("winner");
      evidence.push(edge, `${results} ${resultLabel.toLowerCase()} · ${Math.round(spendShare * 100)}% of spend`);
    } else if (
      results >= rules.scalingMinResults &&
      spendShare < rules.scalingMaxSpendShare &&
      (cur.frequency ?? 0) < rules.scalingMaxFrequency &&
      ad.status === "ACTIVE"
    ) {
      flags.add("scaling_candidate");
      evidence.push(edge, `Only ${Math.round(spendShare * 100)}% of spend · frequency ${fmtNum(cur.frequency)}`);
    }
  }

  // --- Primary label (most urgent first) --------------------------------------
  const order: CreativeLabel[] = ["fatigue", "underperformer", "winner", "scaling_candidate"];
  const label = order.find((l) => flags.has(l)) ?? "stable";
  const alsoFlags = order.filter((l) => l !== label && flags.has(l));

  if (label === "stable") {
    evidence.push(
      accEff != null && adEff != null
        ? useRoas
          ? `ROAS ${fmtNum(cur.roas)}x vs account ${fmtNum(acc.roas)}x`
          : `Cost per ${result1} ${fmt.money(cur.cpr)} vs account ${fmt.money(acc.cpr)}`
        : `${results} ${resultLabel.toLowerCase()} in the period`,
    );
  }

  if ((label === "winner" || label === "scaling_candidate") && results < 5) {
    evidence.push(`Small sample (${results} ${resultLabel.toLowerCase()}) — treat as directional`);
  }
  const active = ad.status == null || ad.status === "ACTIVE";
  return {
    ...base,
    label,
    alsoFlags,
    evidence,
    recommendation: active ? recommend(label, alsoFlags, spendShare) : recommendInactive(label, ad.status!),
  };
}

function recommend(label: CreativeLabel, also: CreativeLabel[], spendShare: number): string {
  switch (label) {
    case "fatigue":
      return also.includes("winner")
        ? "A former winner showing fatigue. Launch 2–3 new variants on the same angle (new hook, first 3 seconds, visual) before it declines further, then shift budget to the best variant."
        : "Refresh this creative: test a new hook or format on the same message, and consider lowering its share of budget while replacements ramp up.";
    case "underperformer":
      return spendShare >= 0.2
        ? "Takes a large share of spend at poor efficiency. Consider pausing it or moving its budget to the account's best ads, then replacing it with a new variant."
        : "Consider pausing or replacing it. Check whether the landing page and offer match the ad's promise before testing a new version.";
    case "winner":
      return "Keep it running and use it as the control. Build new variants from its angle (new hook, format or first frame) to extend its life.";
    case "scaling_candidate":
      return "Efficient but under-funded. Consider giving it more delivery: duplicate it into a scaling ad set or pause weaker ads in its ad set so it gets more budget.";
    default:
      return "Performing in line with the account. No action needed now.";
  }
}

function recommendInactive(label: CreativeLabel, status: string): string {
  const state = status.replace(/_/g, " ").toLowerCase();
  switch (label) {
    case "winner":
    case "scaling_candidate":
      return `Currently ${state}, but it performed well in this period. Consider re-enabling it or reusing its angle in a new ad.`;
    case "underperformer":
    case "fatigue":
      return `Already ${state} — keep it off. Use what it shows (angle, format) to avoid repeating it.`;
    default:
      return `Currently ${state}.`;
  }
}

const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;

export const CREATIVE_LABEL_TEXT: Record<CreativeLabel, string> = {
  winner: "Winner",
  scaling_candidate: "Scaling candidate",
  fatigue: "Creative fatigue",
  underperformer: "Underperformer",
  stable: "Stable",
  low_data: "Low data",
};

/** Hook rate (3-second views / impressions) and hold rate (ThruPlays / 3-second views). */
export function videoRates(impressions: number, views3s: number | null, thruplays: number | null) {
  return {
    hookRate: views3s != null && impressions ? views3s / impressions : null,
    holdRate: views3s && thruplays != null ? thruplays / views3s : null,
  };
}
