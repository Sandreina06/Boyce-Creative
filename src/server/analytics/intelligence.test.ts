import { describe, expect, it } from "vitest";
import { cplPosition, BENCHMARKS } from "./benchmarks";
import { bestGroup, groupBy } from "./copy";
import { assessCreative } from "./creative";
import { decomposeCpr, evaluateHealth } from "./health";
import { derive, type BaseMetrics } from "./metrics";
import { evaluateStrategy } from "./strategy";

const m = (p: Partial<BaseMetrics>): BaseMetrics => ({
  spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: null, results: 0, revenue: null, ...p,
});
const fmt = { money: (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`), pct: (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`) };
const account = derive(m({ spend: 1000, impressions: 40000, linkClicks: 800, results: 20, reach: 10000 }));
const baseline = { current: account, efficiency: "cpr" as const };

describe("assessCreative", () => {
  it("never calls high frequency alone fatigue", () => {
    const a = assessCreative(
      { id: "a", status: "ACTIVE", current: m({ spend: 300, impressions: 12000, linkClicks: 240, results: 6, reach: 2500 }), previous: m({ spend: 300, impressions: 12000, linkClicks: 240, results: 6, reach: 4000 }) },
      baseline, 1000, fmt, "Leads",
    );
    expect(a.current.frequency).toBeGreaterThan(4);
    expect(a.label).not.toBe("fatigue");
  });
  it("flags fatigue when frequency rises AND CTR falls AND CPL rises", () => {
    const a = assessCreative(
      { id: "a", status: "ACTIVE", current: m({ spend: 400, impressions: 15000, linkClicks: 150, results: 5, reach: 4000 }), previous: m({ spend: 400, impressions: 15000, linkClicks: 300, results: 10, reach: 7000 }) },
      baseline, 1000, fmt, "Leads",
    );
    expect(a.label).toBe("fatigue");
    expect(a.evidence.join(" ")).toMatch(/Frequency.*CTR|CTR/);
  });
  it("labels big-spend zero-result ads as underperformers and efficient under-funded ads as scaling candidates", () => {
    const under = assessCreative({ id: "u", status: "ACTIVE", current: m({ spend: 150, impressions: 5000, linkClicks: 60 }), previous: null }, baseline, 1000, fmt, "Leads");
    expect(under.label).toBe("underperformer");
    const scale = assessCreative({ id: "s", status: "ACTIVE", current: m({ spend: 60, impressions: 3000, linkClicks: 70, results: 3, reach: 2500 }), previous: null }, baseline, 1000, fmt, "Leads");
    expect(scale.label).toBe("scaling_candidate");
    const low = assessCreative({ id: "l", status: "ACTIVE", current: m({ spend: 5, impressions: 200 }), previous: null }, baseline, 1000, fmt, "Leads");
    expect(low.label).toBe("low_data");
  });
});

describe("decomposeCpr", () => {
  it("shares sum to 1 and CTR dominates when CTR drops", () => {
    const prev = derive(m({ spend: 1000, impressions: 50000, linkClicks: 1000, results: 20 }));
    const cur = derive(m({ spend: 1000, impressions: 51000, linkClicks: 700, results: 13 }));
    const d = decomposeCpr(cur, prev)!;
    expect(d.parts.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 9);
    expect(d.dominant.driver).toBe("CTR");
  });
});

describe("evaluateHealth", () => {
  it("flags learning limited ad sets, single-ad ad sets and tracking gaps", () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-0${i + 1}`, spend: 30, results: 2 })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: `2026-09-1${i}`, spend: 30, results: 0 })),
    ];
    const issues = evaluateHealth({
      resultLabel: "Leads", primaryKpiLabel: "CPL", efficiency: "cpr",
      current: m({ spend: 300, impressions: 10000, linkClicks: 200, results: 14 }), previous: null,
      comparisonLabel: "previous period", rangeDays: 10, campaigns: [],
      adsets: [{ id: "as1", name: "Golf - Broad", campaignName: "C", status: "ACTIVE", learningStage: "FAIL", current: m({ spend: 300, results: 14 }), ads: [{ id: "a", name: "Ad", spend: 300 }] }],
      creatives: [], daily, pacing: null, fmt,
    });
    const ids = issues.map((i) => i.id);
    expect(ids).toContain("learning_limited:as1");
    expect(ids).toContain("single_ad:as1");
    expect(ids).toContain("tracking_gap");
    expect(issues[0].severity).toBe("critical");
  });
});

describe("strategy", () => {
  const texts = groupBy(
    [
      { body: "Same text", b: m({ spend: 500, impressions: 20000, linkClicks: 300, results: 9 }) },
      { body: "Same text", b: m({ spend: 400, impressions: 15000, linkClicks: 200, results: 9 }) },
    ],
    (x) => x.body,
    (x) => x.b,
  );
  const dests = groupBy([{ u: "http://fb.me/", b: m({ spend: 900, impressions: 35000, linkClicks: 500, results: 18 }) }], (x) => x.u, (x) => x.b, 0);

  it("gives roofing instant-form accounts a benchmark read, lead-quality advice and a copy-test warning", () => {
    const out = evaluateStrategy({
      clientName: "Edwards Roofing", industry: "roofing", leadMethod: "instant_form", serviceArea: null,
      resultLabel: "Leads", efficiency: "cpr", current: derive(m({ spend: 910.54, impressions: 18782, linkClicks: 298, results: 18 })),
      totalResults: 18, primaryTexts: texts, headlines: texts, destinations: dests,
      formats: { video: 0, static: 3 }, belowAvgConversionRanking: [], belowAvgQualityRanking: [], landingPageViews: null, fmt,
    });
    const ids = out.map((o) => o.id);
    expect(ids).toContain("benchmark_cpl_within"); // $50.59 is inside $40–$80
    expect(ids).toContain("instant_form_quality");
    expect(ids).toContain("no_copy_test");
    expect(ids).toContain("format_mix");
    expect(out.find((o) => o.id === "instant_form_quality")!.recommendation).toMatch(/Higher intent/);
  });

  it("still flags a missing copy test when a second text barely delivered (Edwards case)", () => {
    const g = groupBy(
      [
        { t: "Roof estimate text", b: m({ spend: 800, impressions: 17000, linkClicks: 260, results: 16 }) },
        { t: "Roof estimate text", b: m({ spend: 90, impressions: 2000, linkClicks: 25, results: 1 }) },
        { t: "Social post", b: m({ spend: 17, impressions: 525, linkClicks: 18, results: 1 }) },
      ],
      (x) => x.t,
      (x) => x.b,
    );
    const out = evaluateStrategy({
      clientName: "E", industry: "roofing", leadMethod: "instant_form", serviceArea: null, resultLabel: "Leads", efficiency: "cpr",
      current: derive(m({ spend: 907, impressions: 19525, linkClicks: 303, results: 18 })), totalResults: 18,
      primaryTexts: g, headlines: [], destinations: [], formats: { video: 1, static: 2 },
      belowAvgConversionRanking: [], belowAvgQualityRanking: [], landingPageViews: null, fmt,
    });
    expect(out.map((o) => o.id)).toContain("no_copy_test");
  });

  it("finds the best primary text only when at least two texts have enough data", () => {
    const g = groupBy(
      [
        { t: "A", b: m({ spend: 300, impressions: 9000, linkClicks: 150, results: 10 }) },
        { t: "B", b: m({ spend: 300, impressions: 9000, linkClicks: 150, results: 4 }) },
        { t: "C", b: m({ spend: 5, impressions: 100, linkClicks: 2, results: 1 }) },
      ],
      (x) => x.t,
      (x) => x.b,
    );
    expect(bestGroup(g, "cpr")!.key).toBe("A"); // C is cheaper but has too little data
  });

  it("positions CPL against benchmark ranges", () => {
    expect(cplPosition(30, BENCHMARKS.roofing)).toBe("below");
    expect(cplPosition(60, BENCHMARKS.roofing)).toBe("within");
    expect(cplPosition(95, BENCHMARKS.roofing)).toBe("above");
  });
});
