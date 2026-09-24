import { describe, expect, it } from "vitest";
import { categorize, entityKind, parseActivity, resolveStatusChains } from "./activity";
import { computeImpact, measurementLevel } from "./impact";
import type { BaseMetrics } from "./metrics";

// Shapes copied from real Edwards Roofing activity rows (2026-09).
const status = (time: string, actor: string, oldV: string, newV: string) => ({
  activity_event_time: time,
  activity_actor_name: actor,
  activity_event_type: "update_ad_run_status",
  activity_translated_event_type: "Ad status updated",
  activity_object_type: "ADGROUP",
  activity_object_id: "120259639409230370",
  activity_object_name: "07.23.2026 Banners",
  activity_extra_data: JSON.stringify({ old_value: oldV, new_value: newV, campaign_id: 120259260946450370, type: "run_status" }),
});

describe("parseActivity", () => {
  it("maps Meta's legacy object names", () => {
    expect(entityKind("ADGROUP", "update_ad_run_status")).toBe("ad");
    expect(entityKind("CAMPAIGN", "update_ad_set_budget")).toBe("adset");
    expect(entityKind("CAMPAIGN_GROUP", "update_campaign_budget")).toBe("campaign");
    expect(entityKind("CAMPAIGN", "create_audience")).toBe("audience");
    expect(categorize("update_campaign_budget", "campaign")).toBe("budget");
    expect(categorize("update_ad_set_bid_strategy", "adset")).toBe("bid_strategy");
    expect(categorize("update_ad_set_targeting", "adset")).toBe("targeting");
  });

  it("turns Meta's two-step pause into one 'Ad paused: Active → Paused' decision", () => {
    const rows = [
      status("2026-09-11T19:25:36+0000", "Sonia Nuñez", "Pending Process", "Inactive"),
      status("2026-09-11T19:25:17+0000", "Sonia Nuñez", "Active", "Pending Process"),
    ];
    const kept = resolveStatusChains(rows.map((r) => parseActivity(r, "1048672036926458")!)).filter((c) => !c.isNoise);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ action: "Ad paused", previousValue: "Active", newValue: "Paused", category: "ad_status", parentAdsetId: "120259260946450370" });
  });

  it("drops Meta's review completion, billing, image-library and delivery notices", () => {
    const noise = [
      status("2026-09-12T02:55:10+0000", "Meta", "Pending Review", "Active"),
      { activity_event_time: "2026-09-20T14:10:31+0000", activity_actor_name: "Meta", activity_event_type: "ad_account_billing_charge", activity_object_type: "ACCOUNT", activity_extra_data: "{}" },
      { activity_event_time: "2026-09-12T02:50:39+0000", activity_actor_name: "Sonia Nuñez", activity_event_type: "add_images", activity_object_type: "ACCOUNT", activity_extra_data: "{}" },
      { activity_event_time: "2026-09-13T23:52:58+0000", activity_actor_name: "Meta", activity_event_type: "first_delivery_event", activity_object_type: "ADGROUP", activity_extra_data: "{}" },
    ];
    expect(noise.map((r) => parseActivity(r, "1")!.isNoise)).toEqual([true, true, true, true]);
  });

  it("renders budgets from cents and creative swaps without URLs", () => {
    const budget = parseActivity(
      { activity_event_time: "2026-09-01T10:00:00+0000", activity_actor_name: "Sonia", activity_event_type: "update_campaign_budget", activity_object_type: "CAMPAIGN_GROUP", activity_extra_data: JSON.stringify({ old_value: 3000, new_value: 4000 }) },
      "1",
    )!;
    expect([budget.previousValue, budget.newValue]).toEqual(["$30.00", "$40.00"]);
    const swap = parseActivity(
      { activity_event_time: "2026-09-12T02:51:27+0000", activity_actor_name: "Sonia", activity_event_type: "update_ad_creative", activity_object_type: "ADGROUP", activity_extra_data: JSON.stringify({ old_value: ["https://x/a.png", "291"], new_value: ["https://x/b.png", "292"] }) },
      "1",
    )!;
    expect(swap).toMatchObject({ action: "Ad creative replaced", previousValue: null, newValue: null, category: "creative" });
  });
});

describe("impact", () => {
  const m = (spend: number, results: number, impressions = 1000, linkClicks = 20): BaseMetrics => ({ spend, impressions, clicks: linkClicks, linkClicks, reach: null, results, revenue: null });

  it("measures pauses and launches one level up", () => {
    expect(measurementLevel("ad_status", "ad")).toEqual({ level: "adset", useParent: true });
    expect(measurementLevel("creative", "ad")).toEqual({ level: "adset", useParent: true });
    expect(measurementLevel("budget", "campaign")).toEqual({ level: "campaign", useParent: false });
    expect(measurementLevel("targeting", "adset")).toEqual({ level: "adset", useParent: false });
  });

  it("compares 7 days before vs 7 days after, excluding the change day", () => {
    const daily = new Map<string, BaseMetrics>();
    for (let d = 1; d <= 7; d++) daily.set(`2026-09-0${d}`, m(50, 1)); // before: CPL $50
    daily.set("2026-09-08", m(999, 0)); // change day — ignored
    for (let d = 9; d <= 15; d++) daily.set(`2026-09-${String(d).padStart(2, "0")}`, m(50, 2)); // after: CPL $25
    const impact = computeImpact("2026-09-08", daily, "2026-09-22", false);
    expect(impact.status).toBe("complete");
    expect(impact.metrics.cpr!.previous).toBe(50);
    expect(impact.metrics.cpr!.current).toBe(25);
    expect(impact.metrics.cpr!.pct).toBe(-50);
    expect(impact.metrics.cpr!.sentiment).toBe("good");
  });

  it("waits for at least 3 complete days after the change", () => {
    expect(computeImpact("2026-09-21", new Map(), "2026-09-22", false).status).toBe("too_early");
  });
});

describe("summarizeImpact", () => {
  it("uses coincidence language, never causal", async () => {
    const { summarizeImpact } = await import("./impact");
    const s = summarizeImpact(
      { status: "complete", beforeDays: 7, afterDays: 7, before: null, after: null, metrics: { cpr: { current: 99, previous: 70, abs: 29, pct: 42, trend: "up", sentiment: "bad" } } },
      "CPL", "Leads", "the ad set",
    )!;
    expect(s).toMatch(/CPL rose \+42% at the ad set/);
    expect(s).toMatch(/not proof/);
    expect(s).not.toMatch(/caused by|because of/);
  });
});
