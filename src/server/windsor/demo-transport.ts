import type { GetDataRequest, WindsorRow, WindsorTransport } from "./client";
import { F } from "./fields";

/**
 * DEMO DATA generator.
 *
 * Produces deterministic, synthetic Meta-shaped rows for any account id so the
 * app can be developed and demoed without network access. Every page shows a
 * "DEMO DATA" banner when this transport is active. Nothing here is real.
 */
export class DemoWindsorTransport implements WindsorTransport {
  readonly source = "demo" as const;

  async getData(req: GetDataRequest): Promise<WindsorRow[]> {
    if (req.fields.includes("activity_event_type")) return demoActivity(req);
    const dims = req.fields.filter((f) => DIMENSION_FIELDS.has(f));
    const dates = eachDate(req.dateFrom, req.dateTo);
    const groups = new Map<string, { dims: WindsorRow; m: Metrics; days: Set<string> }>();

    for (const accountId of req.accounts) {
      for (const ad of buildTree(accountId)) {
        for (const d of dates) {
          const m = adDay(ad, d);
          if (m.spend <= 0) continue;
          const dimValues: WindsorRow = {};
          for (const f of dims) dimValues[f] = dimValue(f, ad, d);
          const key = JSON.stringify(dimValues);
          let g = groups.get(key);
          if (!g) {
            g = { dims: dimValues, m: emptyMetrics(), days: new Set() };
            groups.set(key, g);
          }
          addMetrics(g.m, m);
          g.days.add(d);
        }
      }
    }

    const fetchedAt = new Date().toISOString().slice(0, 19);
    return [...groups.values()].map(({ dims: dv, m, days }) => {
      const frequency = 1 + 0.18 * Math.pow(days.size, 0.75);
      const row: WindsorRow = { ...dv };
      for (const f of req.fields) {
        if (f in row) continue;
        row[f] = metricValue(f, m, frequency, fetchedAt, String(dv[F.adName] ?? "").startsWith("UGC Video"));
      }
      return row;
    });
  }
}

// ---------------------------------------------------------------------------

type DemoAd = {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string;
  campaignDailyBudgetMinor: number;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  creativeId: string;
  /** Share of account spend and per-ad performance multipliers. */
  weight: number;
  cpm: number;
  ctr: number;
  cvr: number;
  aov: number;
  /** Per-day drift of CTR (negative = fatiguing). */
  ctrDrift: number;
  baseDailySpend: number;
  startDaysAgo: number;
};

const CAMPAIGNS = [
  { name: "DEMO | Prospecting | Broad", adsets: ["Broad 25-54", "Advantage+ Audience"] },
  { name: "DEMO | Prospecting | Interests", adsets: ["Home Improvement", "Local Business Owners"] },
  { name: "DEMO | Retargeting | 30D", adsets: ["Site Visitors 30D", "Engagers 60D"] },
];
const ADS = ["UGC Video 01", "Static Offer 02", "Carousel 03"];

const treeCache = new Map<string, DemoAd[]>();

function buildTree(accountId: string): DemoAd[] {
  const cached = treeCache.get(accountId);
  if (cached) return cached;
  const rnd = rng(hash(accountId));
  const baseDailySpend = 20 + rnd() * 80;
  const ads: DemoAd[] = [];
  CAMPAIGNS.forEach((c, ci) => {
    const campaignId = `9${accountId.slice(-6)}${ci}0`;
    const campaignWeight = [0.55, 0.3, 0.15][ci];
    c.adsets.forEach((as, ai) => {
      const adsetId = `${campaignId}${ai}`;
      ADS.forEach((adName, di) => {
        const adId = `${adsetId}${di}`;
        ads.push({
          accountId,
          accountName: `Demo account ${accountId.slice(-4)}`,
          campaignId,
          campaignName: c.name,
          campaignObjective: "OUTCOME_LEADS",
          campaignDailyBudgetMinor: Math.round(baseDailySpend * campaignWeight * 100),
          adsetId,
          adsetName: as,
          adId,
          adName,
          creativeId: `7${adId}`,
          weight: campaignWeight * (ai === 0 ? 0.6 : 0.4) * [0.5, 0.3, 0.2][di],
          cpm: 18 + rnd() * 30 + (ci === 2 ? 12 : 0),
          ctr: 0.006 + rnd() * 0.014 + (ci === 2 ? 0.006 : 0),
          cvr: 0.03 + rnd() * 0.08 + (ci === 2 ? 0.04 : 0),
          aov: 60 + rnd() * 140,
          ctrDrift: di === 0 ? -0.004 : (rnd() - 0.5) * 0.002,
          baseDailySpend,
          startDaysAgo: 400,
        });
      });
    });
  });
  treeCache.set(accountId, ads);
  return ads;
}

type Metrics = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  results: number;
  value: number;
};

const emptyMetrics = (): Metrics => ({ spend: 0, impressions: 0, clicks: 0, linkClicks: 0, results: 0, value: 0 });

function addMetrics(a: Metrics, b: Metrics) {
  a.spend += b.spend;
  a.impressions += b.impressions;
  a.clicks += b.clicks;
  a.linkClicks += b.linkClicks;
  a.results += b.results;
  a.value += b.value;
}

function adDay(ad: DemoAd, date: string): Metrics {
  const r = rng(hash(`${ad.adId}|${date}`));
  const t = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  const weekly = 1 + 0.12 * Math.sin((t / 7) * 2 * Math.PI);
  const noise = 0.8 + r() * 0.4;
  const spend = round2(ad.baseDailySpend * ad.weight * weekly * noise);
  // Slow cyclical drift so period-over-period comparisons show movement.
  const cycle = Math.sin(t / 23 + hash(ad.adId) % 7);
  const cpm = ad.cpm * (1 + 0.08 * cycle) * (0.9 + r() * 0.2);
  const impressions = Math.round((spend / cpm) * 1000);
  const ctr = Math.max(0.002, ad.ctr * (1 + ad.ctrDrift * (t % 60) + 0.1 * cycle));
  const clicks = Math.round(impressions * ctr * (0.9 + r() * 0.2));
  const linkClicks = Math.round(clicks * (0.55 + r() * 0.15));
  const results = Math.floor(linkClicks * ad.cvr * (1 - 0.15 * cycle) + r());
  return { spend, impressions, clicks, linkClicks, results, value: round2(results * ad.aov) };
}

const DIMENSION_FIELDS = new Set<string>([
  F.date,
  F.accountId,
  F.accountName,
  F.accountCurrency,
  F.accountTimezone,
  F.campaignId,
  F.campaignName,
  F.campaignObjective,
  F.campaignEffectiveStatus,
  F.campaignDailyBudget,
  F.campaignLifetimeBudget,
  F.adsetId,
  F.adsetName,
  F.adsetEffectiveStatus,
  F.adsetDailyBudget,
  F.adsetLifetimeBudget,
  F.adId,
  F.adName,
  F.adEffectiveStatus,
  F.creativeId,
  F.thumbnailUrl,
  F.destinationUrl,
  F.adTitle,
  F.adBody,
  F.callToAction,
  F.qualityRanking,
  F.engagementRanking,
  F.conversionRanking,
  F.adsetLearningStage,
  F.adsetOptimizationGoal,
]);

function dimValue(field: string, ad: DemoAd, date: string): string | number | null {
  switch (field) {
    case F.date:
      return date;
    case F.accountId:
      return ad.accountId;
    case F.accountName:
      return ad.accountName;
    case F.accountCurrency:
      return "USD";
    case F.accountTimezone:
      return "America/New_York";
    case F.campaignId:
      return ad.campaignId;
    case F.campaignName:
      return ad.campaignName;
    case F.campaignObjective:
      return ad.campaignObjective;
    case F.campaignEffectiveStatus:
    case F.adsetEffectiveStatus:
    case F.adEffectiveStatus:
      return "ACTIVE";
    case F.campaignDailyBudget:
      return ad.campaignDailyBudgetMinor;
    case F.campaignLifetimeBudget:
      return 0;
    case F.adsetId:
      return ad.adsetId;
    case F.adsetName:
      return ad.adsetName;
    case F.adsetDailyBudget:
    case F.adsetLifetimeBudget:
      return null;
    case F.adId:
      return ad.adId;
    case F.adName:
      return ad.adName;
    case F.creativeId:
      return ad.creativeId;
    case F.thumbnailUrl:
      return null;
    case F.destinationUrl:
      return ad.campaignName.includes("Retargeting") ? "https://example.com/offer" : "http://fb.me/";
    case F.adTitle:
      return ad.adName.startsWith("UGC") ? "Demo headline A — free estimate" : "Demo headline B — limited offer";
    case F.adBody:
      return ad.adName.startsWith("Static")
        ? "Demo primary text 2: offer-led copy. Synthetic creative for development only."
        : "Demo primary text 1: problem-led copy. Synthetic creative for development only.";
    case F.callToAction:
      return "LEARN_MORE";
    case F.qualityRanking:
    case F.engagementRanking:
      return "AVERAGE";
    case F.conversionRanking:
      return ad.adName.startsWith("Carousel") ? "BELOW_AVERAGE_35" : "AVERAGE";
    case F.adsetLearningStage:
      return ad.adsetName.includes("Interests") || ad.adsetName.includes("Home") ? "FAIL" : "LEARNING";
    case F.adsetOptimizationGoal:
      return "LEAD_GENERATION";
    default:
      return null;
  }
}

function metricValue(field: string, m: Metrics, frequency: number, fetchedAt: string, isVideo = false): number | string | null {
  switch (field) {
    case F.spend:
      return round2(m.spend);
    case F.impressions:
      return m.impressions;
    case F.clicks:
      return m.clicks;
    case F.linkClicks:
      return m.linkClicks;
    case F.reach:
      return Math.round(m.impressions / frequency);
    case F.frequency:
      return Math.round(frequency * 10_000) / 10_000;
    case F.dataFetchedAt:
      return fetchedAt;
  }
  // Video metrics only for demo video ads (names starting "UGC Video"); null for static, like Meta.
  if ([F.videoViews3s, F.videoP25, F.videoP100, F.thruplays].includes(field as never)) {
    if (!isVideo) return null;
    const rate = { [F.videoViews3s]: 0.28, [F.videoP25]: 0.2, [F.videoP100]: 0.05, [F.thruplays]: 0.07 }[field]!;
    return Math.round(m.impressions * rate);
  }
  if (field.startsWith("action_values_") || field.startsWith("conversion_values_")) {
    return m.results ? round2(m.value) : null;
  }
  if (field.startsWith("actions_") || field.startsWith("conversions_")) {
    return m.results || null; // Windsor returns null rather than 0 for absent actions
  }
  return null;
}

// ---------------------------------------------------------------------------

/** Synthetic change history shaped exactly like Meta's activity log. */
function demoActivity(req: GetDataRequest): WindsorRow[] {
  const rows: WindsorRow[] = [];
  const dates = eachDate(req.dateFrom, req.dateTo);
  for (const accountId of req.accounts) {
    const ads = buildTree(accountId);
    const at = (daysFromEnd: number, hour: number) => {
      const d = dates[Math.max(0, dates.length - 1 - daysFromEnd)];
      return `${d}T${String(hour).padStart(2, "0")}:15:00+0000`;
    };
    const push = (time: string, actor: string, type: string, label: string, objType: string, id: string, name: string, extra: object) =>
      rows.push({
        activity_event_time: time,
        activity_actor_name: actor,
        activity_event_type: type,
        activity_translated_event_type: label,
        activity_object_type: objType,
        activity_object_id: id,
        activity_object_name: name,
        activity_extra_data: JSON.stringify(extra),
      });
    const fatigued = ads[0];
    const camp = ads[0];
    const adset = ads[3];
    push(at(20, 15), "Demo Manager", "update_campaign_budget", "Campaign budget updated", "CAMPAIGN_GROUP", camp.campaignId, camp.campaignName, {
      old_value: camp.campaignDailyBudgetMinor,
      new_value: Math.round(camp.campaignDailyBudgetMinor * 1.2),
    });
    push(at(14, 17), "Demo Manager", "update_ad_run_status", "Ad status updated", "ADGROUP", ads[2].adId, ads[2].adName, { old_value: "Active", new_value: "Pending Process", campaign_id: Number(ads[2].adsetId) });
    push(at(14, 17), "Demo Manager", "update_ad_run_status", "Ad status updated", "ADGROUP", ads[2].adId, ads[2].adName, { old_value: "Pending Process", new_value: "Inactive", campaign_id: Number(ads[2].adsetId) });
    push(at(9, 14), "Demo Manager", "create_ad", "Ad created", "ADGROUP", fatigued.adId, `${fatigued.adName} v2`, { campaign_id: { new: Number(fatigued.adsetId) } });
    push(at(9, 14), "Meta", "update_ad_run_status", "Ad status updated", "ADGROUP", fatigued.adId, fatigued.adName, { old_value: "Pending Review", new_value: "Active" });
    push(at(5, 16), "Demo Manager", "update_ad_set_targeting", "Ad set targeting updated", "CAMPAIGN", adset.adsetId, adset.adsetName, { old_value: "Ages 25-54", new_value: "Ages 30-65, Advantage+ audience on" });
    push(at(3, 9), "Meta", "ad_account_billing_charge", "Account billed", "ACCOUNT", accountId, "Demo account", { new_value: 40000 });
    push(at(1, 11), "Demo Manager", "update_ad_set_bid_strategy", "Ad set bid strategy updated", "CAMPAIGN", adset.adsetId, adset.adsetName, { old_value: "Lowest cost", new_value: "Cost per result goal" });
  }
  return rows;
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
