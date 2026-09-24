import { benchmarkFor, cplPosition, type Source } from "./benchmarks";
import { bestGroup, isInstantForm, type CopyGroup } from "./copy";
import type { Issue } from "./health";
import type { Derived } from "./metrics";

/**
 * Context-aware recommendations — how a senior paid media manager would read
 * the account given the client's industry, lead capture method and the
 * published benchmarks. Deterministic: the same inputs always produce the same
 * output, and every recommendation lists the evidence it is based on.
 */

export type StrategyContext = {
  clientName: string;
  industry: string | null;
  leadMethod: "instant_form" | "website" | "mixed" | "traffic" | "other" | null;
  serviceArea: string | null;
  resultLabel: string;
  efficiency: "cpr" | "roas";
  current: Derived;
  totalResults: number;
  primaryTexts: CopyGroup[];
  headlines: CopyGroup[];
  destinations: CopyGroup[];
  /** Ads with delivery: whether each is a video (has 3-second views). */
  formats: { video: number; static: number };
  /** Ads whose Meta conversion-rate ranking is below average, with their spend. */
  belowAvgConversionRanking: { name: string; spend: number }[];
  belowAvgQualityRanking: { name: string; spend: number }[];
  /** Landing page views (for website traffic) — for click→LPV drop-off. */
  landingPageViews: number | null;
  fmt: { money: (v: number | null) => string; pct: (v: number | null) => string };
};

export type StrategyIssue = Issue & { sources?: Source[] };

/** Copy angles worth testing, by industry. */
const ANGLES: Record<string, string[]> = {
  roofing: [
    "storm or leak damage (urgency, photos of real local roofs)",
    "insurance-claim help (\"we meet the adjuster\")",
    "financing / low monthly payment",
    "warranty and workmanship guarantee",
    "local proof: reviews, BBB A+, years in business, crew faces",
  ],
  home_improvement: ["before/after transformation", "financing", "limited-time offer", "local reviews", "speed of scheduling"],
  travel_hospitality: ["package price up front", "weekend getaway vs. group/buddies trip", "course and lodging visuals", "seasonal availability / limited tee times"],
  local_retail: ["price and offer first", "scarcity / limited stock", "seasonal need", "in-store pickup convenience"],
  equipment_dealer: ["new inventory by brand", "financing offers", "service and parts reliability", "family-owned local trust"],
  all_industries: ["problem-led", "offer-led", "social proof", "urgency"],
};

export function evaluateStrategy(c: StrategyContext): StrategyIssue[] {
  const out: StrategyIssue[] = [];
  const b = benchmarkFor(c.industry);
  const results = c.resultLabel.toLowerCase();
  const angles = ANGLES[c.industry ?? ""] ?? ANGLES.all_industries;
  const leadGen = c.leadMethod === "instant_form" || c.leadMethod === "website" || c.leadMethod === "mixed";

  // 1. Cost per lead vs published benchmark ---------------------------------------
  if (leadGen && c.current.cpr != null && c.totalResults >= 3 && b.cpl) {
    const pos = cplPosition(c.current.cpr, b);
    const range = b.cpl.low != null && b.cpl.high != null ? `${c.fmt.money(b.cpl.low)}–${c.fmt.money(b.cpl.high)}` : `≈${c.fmt.money(b.cpl.typical)}`;
    const evidence = [`Cost per lead ${c.fmt.money(c.current.cpr)} vs ${b.label} ${range}${b.cpl.note ? ` (${b.cpl.note})` : ""}`];
    const approx = b.cpl.comparability === "approximate";
    if (approx) evidence.push("Approximate comparison: the published figure is not a lead benchmark.");
    if (pos === "above") {
      out.push({
        id: "benchmark_cpl_above",
        severity: approx ? "info" : "warning",
        category: "performance",
        title: `Cost per lead is above the ${b.label.toLowerCase()} range`,
        evidence,
        recommendation: `Prioritise the fundamentals that move CPL most: stronger hooks in the first 3 seconds, a clearer offer in the headline, and a lower-friction form. Test new angles: ${angles.slice(0, 3).join("; ")}.`,
        sources: b.sources,
      });
    } else if (pos === "below") {
      out.push({
        id: "benchmark_cpl_below",
        severity: "opportunity",
        category: "performance",
        title: `Cost per lead is below the ${b.label.toLowerCase()} range`,
        evidence,
        recommendation:
          c.leadMethod === "instant_form"
            ? "Cheap leads are only good if they turn into appointments. Confirm lead-to-appointment rate with the client before scaling; if quality holds, scale gradually (about 20% budget steps)."
            : "Efficient versus the industry. If lead quality is confirmed, there is room to scale gradually (about 20% budget steps every few days).",
        sources: b.sources,
      });
    } else if (pos === "within") {
      out.push({
        id: "benchmark_cpl_within",
        severity: "info",
        category: "performance",
        title: `Cost per lead is within the ${b.label.toLowerCase()} range`,
        evidence,
        recommendation: "In line with the industry. Gains now come from lead quality and creative testing rather than cheaper clicks.",
        sources: b.sources,
      });
    }
  }

  // 2. Instant-form lead quality ---------------------------------------------------
  const formShare = shareOf(c.destinations, (g) => isInstantForm(g.key));
  if (formShare >= 0.5 && leadGen) {
    out.push({
      id: "instant_form_quality",
      severity: "opportunity",
      category: "strategy",
      title: `${Math.round(formShare * 100)}% of spend goes to instant forms — protect lead quality`,
      evidence: [
        ...(c.industry === "roofing" ? b.facts.slice(0, 2) : []),
        "Instant forms pre-fill contact details, which lowers cost per lead but also lowers intent.",
      ],
      recommendation:
        c.industry === "roofing"
          ? "Switch the form to \"Higher intent\" (review screen before submit) and add 1–2 qualifying questions (homeowner? roof age / leak or storm damage? insurance claim?). Call new leads within 5 minutes, and send lead outcomes (booked / sold) back to Meta via the CRM or Conversions API so it optimizes for real appointments, not just form fills."
          : "Use the \"Higher intent\" form type, add a qualifying question, follow up within minutes, and send lead outcomes back to Meta (CRM / Conversions API) so delivery optimizes for quality leads.",
      sources: c.industry === "roofing" ? b.sources : undefined,
    });
  }

  // 3. Copy testing ------------------------------------------------------------
  // A text only counts as "tested" if it had meaningful delivery (≥1,000 impressions or ≥10% of spend).
  const withDelivery = (gs: CopyGroup[]) => {
    const spend = gs.reduce((s, g) => s + g.base.spend, 0);
    return gs.filter((g) => g.base.impressions >= 1000 || (spend > 0 && g.base.spend / spend >= 0.1));
  };
  const texts = withDelivery(c.primaryTexts);
  const heads = withDelivery(c.headlines);
  if (texts.length === 1 && texts[0].ads >= 2) {
    out.push({
      id: "no_copy_test",
      severity: "warning",
      category: "creative",
      title: `All ${texts[0].ads} ads use the same primary text — no copy test is running`,
      evidence: [`"${truncate(texts[0].key, 110)}"`, `${c.fmt.money(texts[0].base.spend)} spent on this one message`],
      recommendation: `Test 2–3 genuinely different angles (not rewordings), keeping the best visual constant: ${angles.join("; ")}.`,
    });
  } else {
    const best = bestGroup(texts, c.efficiency);
    if (best) {
      const others = texts.filter((g) => g !== best && g.enoughData);
      const worst = others.sort((a, b2) => (b2.current.cpr ?? 0) - (a.current.cpr ?? 0))[0];
      out.push({
        id: "best_primary_text",
        severity: "opportunity",
        category: "creative",
        title: "Best-performing primary text",
        evidence: [
          `"${truncate(best.key, 140)}"`,
          c.efficiency === "roas"
            ? `ROAS ${best.current.roas?.toFixed(2)}x across ${best.ads} ads`
            : `Cost per ${singular(results)} ${c.fmt.money(best.current.cpr)} across ${best.ads} ads (${best.base.results} ${results})`,
          ...(worst ? [`Weakest tested text: ${c.fmt.money(worst.current.cpr)} per ${singular(results)}`] : []),
        ],
        recommendation: "Use this message as the control: pair it with new visuals, and write new variants that keep its angle.",
      });
    }
  }
  if (heads.length === 1 && heads[0].ads >= 2) {
    out.push({
      id: "no_headline_test",
      severity: "info",
      category: "creative",
      title: "Every ad uses the same headline",
      evidence: [`"${truncate(heads[0].key, 80)}"`],
      recommendation: "Headlines are cheap to test. Try an offer-led and a proof-led variant (e.g. price or guarantee vs. reviews/years in business).",
    });
  }

  // 4. Format mix ---------------------------------------------------------------
  const totalAds = c.formats.video + c.formats.static;
  if (totalAds >= 2 && (c.formats.video === 0 || c.formats.static === 0)) {
    const missing = c.formats.video === 0 ? "video" : "static image";
    out.push({
      id: "format_mix",
      severity: "info",
      category: "creative",
      title: `No ${missing} ads running`,
      evidence: [`${totalAds} ads with delivery, all ${c.formats.video === 0 ? "static" : "video"}`],
      recommendation:
        c.formats.video === 0
          ? c.industry === "roofing"
            ? "Add short vertical video: before/after roof Reels and crew-on-site clips are reported to outperform other roofing creative on CTR."
            : "Add short vertical video (Reels, 9:16) — Meta's cheapest placements are video-first."
          : "Add static images/carousels; they often win on cost per lead for offer-led messages and are fast to iterate.",
      sources: c.formats.video === 0 && c.industry === "roofing" ? benchmarkFor("roofing").sources : undefined,
    });
  }

  // 5. Website destinations: click → landing page view drop-off, weak pages --------
  const web = c.destinations.filter((g) => g.key.startsWith("http") && !isInstantForm(g.key));
  const webClicks = web.reduce((s, g) => s + g.base.linkClicks, 0);
  if (c.landingPageViews != null && webClicks >= 100) {
    const rate = c.landingPageViews / webClicks;
    if (rate < 0.7) {
      out.push({
        id: "lpv_dropoff",
        severity: "warning",
        category: "strategy",
        title: `Only ${Math.round(rate * 100)}% of link clicks become landing page views`,
        evidence: [`${webClicks.toLocaleString("en-US")} link clicks → ${c.landingPageViews.toLocaleString("en-US")} landing page views`],
        recommendation:
          "People are leaving before the page loads. Check mobile page speed (aim for under ~3 seconds), redirects and pop-ups, and confirm the pixel fires on page load.",
      });
    }
  }
  if (c.leadMethod !== "traffic" && web.length >= 2) {
    const eligible = web.filter((g) => g.base.linkClicks >= 50);
    const avgCvr = eligible.length ? eligible.reduce((s, g) => s + g.base.results, 0) / eligible.reduce((s, g) => s + g.base.linkClicks, 0) : null;
    for (const g of eligible) {
      const cvr = g.base.results / g.base.linkClicks;
      if (avgCvr && cvr < avgCvr * 0.5) {
        out.push({
          id: `weak_page:${g.key}`,
          severity: "warning",
          category: "strategy",
          title: `Landing page converts at half the account average`,
          evidence: [`${g.key.replace(/^https?:\/\//, "")}: ${(cvr * 100).toFixed(1)}% click → ${singular(results)} vs ${(avgCvr * 100).toFixed(1)}% average`],
          recommendation: "Review this page against the ad's promise: same offer and headline above the fold, a short form, click-to-call on mobile, and trust signals (reviews, guarantees).",
        });
      }
    }
  }

  // 6. Meta relevance diagnostics -----------------------------------------------
  if (c.belowAvgConversionRanking.length) {
    const spend = c.belowAvgConversionRanking.reduce((s, a) => s + a.spend, 0);
    out.push({
      id: "conversion_ranking",
      severity: "warning",
      category: "strategy",
      title: `Meta rates conversion rate below average on ${c.belowAvgConversionRanking.length} ad${c.belowAvgConversionRanking.length > 1 ? "s" : ""}`,
      evidence: [`${c.fmt.money(spend)} spent on: ${c.belowAvgConversionRanking.slice(0, 3).map((a) => a.name).join(", ")}`],
      recommendation: "Compared with competing ads for the same audience, people convert less after clicking. Tighten the match between ad promise and form/landing page, and reduce form fields.",
    });
  }
  if (c.belowAvgQualityRanking.length) {
    out.push({
      id: "quality_ranking",
      severity: "info",
      category: "creative",
      title: `Meta rates ad quality below average on ${c.belowAvgQualityRanking.length} ad${c.belowAvgQualityRanking.length > 1 ? "s" : ""}`,
      evidence: [c.belowAvgQualityRanking.slice(0, 3).map((a) => a.name).join(", ")],
      recommendation: "Avoid clickbait-style or low-resolution creative; replace these with clearer, authentic visuals.",
    });
  }

  // 7. Traffic-objective accounts ----------------------------------------------
  if (c.leadMethod === "traffic") {
    const cpc = c.current.cpc;
    out.push({
      id: "traffic_objective",
      severity: "info",
      category: "strategy",
      title: `Optimizing for ${results} — the business outcome is not measured`,
      evidence: [
        `Cost per ${singular(results)} ${c.fmt.money(c.current.cpr)} · CPC ${c.fmt.money(cpc)}${b.trafficCpc ? ` vs ≈${c.fmt.money(b.trafficCpc)} ${b.label.toLowerCase()} benchmark` : ""}`,
      ],
      recommendation:
        "Track the actions that matter to the business as pixel events (calls, contact/quote forms, inventory or directions clicks). Once they fire reliably, test a Leads or Sales objective against traffic.",
      sources: b.sources,
    });
  }

  return out;
}

function shareOf(groups: CopyGroup[], pred: (g: CopyGroup) => boolean): number {
  const total = groups.reduce((s, g) => s + g.base.spend, 0);
  return total ? groups.filter(pred).reduce((s, g) => s + g.base.spend, 0) / total : 0;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const singular = (s: string) => s.replace(/s$/, "");
