/**
 * Third-party Meta Ads benchmarks, used as a sanity check, never as a target.
 *
 * Each value is copied from the cited source (checked 2026-09-24). Benchmarks
 * are cross-account averages with wide variance by geography, offer and season;
 * the UI always shows the source next to the comparison.
 */

export type Source = { title: string; url: string };

export type Benchmark = {
  id: string;
  label: string;
  /** Cost per lead for lead-objective campaigns. */
  cpl?: {
    low?: number;
    typical: number;
    high?: number;
    note?: string;
    /** "approximate" when the source measures a different outcome (e.g. purchases, not leads). */
    comparability?: "direct" | "approximate";
  };
  /** Lead campaigns: link CTR and click → lead conversion rate (fractions). */
  leadCtr?: number;
  leadCvr?: number;
  /** Traffic campaigns. */
  trafficCtr?: number;
  trafficCpc?: number;
  /** Extra facts the strategist rules may cite. */
  facts: string[];
  sources: Source[];
};

const WORDSTREAM_2025: Source = {
  title: "WordStream / LocaliQ — Facebook Ads Benchmarks 2025",
  url: "https://www.wordstream.com/blog/facebook-ads-benchmarks-2025",
};
const SEL_2025: Source = {
  title: "Search Engine Land — Facebook ad costs jump 21% in 2025",
  url: "https://searchengineland.com/facebook-ad-costs-jump-beat-google-461690",
};
const WEBTONIC_ROOFING: Source = {
  title: "Web Tonic — Roofing Facebook Ads Statistics & Benchmarks (2026)",
  url: "https://www.webtonic.io/blog/roofing-facebook-ads-statistics",
};
const THEADSPEND_HOME: Source = {
  title: "TheAdSpend — Facebook Lead Ads Benchmarks for Home Improvement (checked July 2026)",
  url: "https://theadspend.com/blog/facebook-leads-home-improvement",
};

export const BENCHMARKS: Record<string, Benchmark> = {
  all_industries: {
    id: "all_industries",
    label: "All industries (Meta)",
    cpl: { typical: 27.66, note: "all-industry average, +21% YoY" },
    leadCtr: 0.0259,
    leadCvr: 0.0772,
    trafficCtr: 0.0171,
    trafficCpc: 0.7,
    facts: [],
    sources: [WORDSTREAM_2025, SEL_2025],
  },
  roofing: {
    id: "roofing",
    label: "Roofing (Meta lead ads)",
    cpl: { low: 40, typical: 60, high: 80, note: "blended roofing CPL range; optimized accounts reach ~$22" },
    leadCtr: 0.0157,
    leadCvr: 0.0522,
    facts: [
      "Instant-form roofing leads close at roughly 5–8% lead-to-job, vs 15–22% for landing-page leads.",
      "Total cost per booked roof from Meta typically ranges $185–$420.",
      "Before/after vertical (9:16) Reels are reported to outperform other roofing creative 2–4× on CTR.",
      "Storm-response campaigns in the 72 hours after hail can produce leads at $10–$22.",
    ],
    sources: [WEBTONIC_ROOFING, THEADSPEND_HOME],
  },
  home_improvement: {
    id: "home_improvement",
    label: "Home improvement (Meta lead ads)",
    cpl: { typical: 41.26 },
    leadCvr: 0.0522,
    trafficCpc: 0.99,
    facts: [],
    sources: [THEADSPEND_HOME, WORDSTREAM_2025],
  },
  travel_hospitality: {
    id: "travel_hospitality",
    label: "Travel & hospitality (Meta)",
    cpl: { low: 21, high: 32, typical: 26.5, note: "cost per acquisition across travel objectives, not leads", comparability: "approximate" },
    trafficCtr: 0.0276,
    trafficCpc: 1.0,
    facts: ["Travel has one of the highest Meta CTRs of any industry (2.76%)."],
    sources: [WORDSTREAM_2025],
  },
  local_retail: {
    id: "local_retail",
    label: "Local retail (Meta)",
    cpl: { low: 21, high: 32, typical: 26.5, note: "cost per acquisition across retail objectives, not leads", comparability: "approximate" },
    trafficCpc: 1.0,
    facts: [],
    sources: [WORDSTREAM_2025],
  },
  equipment_dealer: {
    id: "equipment_dealer",
    label: "Equipment dealer (closest published: all-industry traffic)",
    trafficCtr: 0.0171,
    trafficCpc: 0.7,
    facts: ["No published Meta benchmark exists for farm-equipment dealers; all-industry traffic averages are used as a rough reference."],
    sources: [WORDSTREAM_2025],
  },
};

export const INDUSTRY_OPTIONS = [
  { id: "roofing", label: "Roofing" },
  { id: "home_improvement", label: "Home improvement / home services" },
  { id: "travel_hospitality", label: "Travel, golf & hospitality" },
  { id: "local_retail", label: "Local retail / hardware" },
  { id: "equipment_dealer", label: "Equipment dealer" },
  { id: "all_industries", label: "Other (all-industry averages)" },
] as const;

export function benchmarkFor(industry: string | null | undefined): Benchmark {
  return (industry && BENCHMARKS[industry]) || BENCHMARKS.all_industries;
}

export type BenchmarkPosition = "below" | "within" | "above";

/** Where a cost per lead sits relative to a benchmark (range if available, else ±20% of typical). */
export function cplPosition(cpl: number, b: Benchmark): BenchmarkPosition | null {
  if (!b.cpl) return null;
  const low = b.cpl.low ?? b.cpl.typical * 0.8;
  const high = b.cpl.high ?? b.cpl.typical * 1.2;
  return cpl < low ? "below" : cpl > high ? "above" : "within";
}
