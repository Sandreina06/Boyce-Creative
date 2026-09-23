import { describe, expect, it } from "vitest";
import { compareValues } from "./compare";
import { contributions } from "./contribution";
import { derive, sumBase, type BaseMetrics } from "./metrics";

const m = (p: Partial<BaseMetrics>): BaseMetrics => ({
  spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0, results: 0, revenue: null, ...p,
});

describe("derive", () => {
  it("matches the values Windsor returned for Edwards Roofing (last 30d)", () => {
    // spend 910.54, impressions 18782, clicks 470 → Windsor cpc 1.9373 (all clicks), cpm 48.4794
    const d = derive(m({ spend: 910.54, impressions: 18782, clicks: 470, linkClicks: 298, reach: 4522, results: 18 }));
    expect(d.cpm).toBeCloseTo(48.4794, 3);
    expect(d.frequency).toBeCloseTo(4.1535, 3);
    expect(d.cpr).toBeCloseTo(50.586, 2);
    expect(d.ctr).toBeCloseTo(298 / 18782, 8);
  });
  it("satisfies CPR = (CPM/1000) / (CTR × CVR)", () => {
    const d = derive(m({ spend: 1234, impressions: 56000, linkClicks: 700, results: 31 }));
    expect(d.cpr!).toBeCloseTo(d.cpm! / 1000 / (d.ctr! * d.cvr!), 9);
  });
  it("returns null instead of dividing by zero", () => {
    const d = derive(m({ spend: 50 }));
    expect(d.cpr).toBeNull();
    expect(d.ctr).toBeNull();
    expect(d.roas).toBeNull();
  });
  it("recomputes ratios from sums (never averages ratios)", () => {
    const total = derive(sumBase([m({ spend: 100, results: 10 }), m({ spend: 300, results: 10 })]));
    expect(total.cpr).toBe(20); // not (10 + 30) / 2
  });
  it("drops reach when summing unless entities are disjoint", () => {
    expect(sumBase([m({ reach: 5 }), m({ reach: 6 })]).reach).toBeNull();
    expect(sumBase([m({ reach: 5 }), m({ reach: 6 })], { keepReach: true }).reach).toBe(11);
  });
});

describe("compareValues", () => {
  it("colours changes by metric direction", () => {
    expect(compareValues(70.63, 51.18, "lower_better")).toMatchObject({ trend: "up", sentiment: "bad" });
    expect(compareValues(70.63, 51.18, "lower_better").pct).toBeCloseTo(38.0, 1);
    expect(compareValues(3.1, 2.5, "higher_better").sentiment).toBe("good");
    expect(compareValues(100, 100.2, "lower_better").trend).toBe("flat");
    expect(compareValues(5, 0, "higher_better").pct).toBeNull();
  });
});

describe("contributions", () => {
  it("ratio contributions sum exactly to the total change", () => {
    const a = { cur: m({ spend: 600, results: 10 }), prev: m({ spend: 400, results: 10 }) };
    const b = { cur: m({ spend: 200, results: 10 }), prev: m({ spend: 200, results: 10 }) };
    const totalCur = sumBase([a.cur, b.cur]);
    const totalPrev = sumBase([a.prev, b.prev]);
    const res = contributions(
      "cpr",
      [
        { id: "a", name: "A", current: a.cur, previous: a.prev },
        { id: "b", name: "B", current: b.cur, previous: b.prev },
      ],
      totalCur,
      totalPrev,
    );
    const change = derive(totalCur).cpr! - derive(totalPrev).cpr!;
    expect(res.reduce((s, r) => s + r.contribution, 0)).toBeCloseTo(change, 9);
    expect(res[0].id).toBe("a");
    expect(res[0].share).toBeCloseTo(1, 9);
  });
  it("handles entities that only exist in one period", () => {
    const res = contributions(
      "spend",
      [
        { id: "new", name: "New", current: m({ spend: 50 }), previous: null },
        { id: "old", name: "Old", current: null, previous: m({ spend: 20 }) },
      ],
      m({ spend: 50 }),
      m({ spend: 20 }),
    );
    expect(res.map((r) => [r.id, r.contribution])).toEqual([["new", 50], ["old", -20]]);
  });
});
