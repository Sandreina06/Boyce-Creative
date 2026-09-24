import { derive, sumBase, type BaseMetrics, type Derived } from "./metrics";

/**
 * Group ads by a copy element (primary text, headline) or destination and
 * compare performance. Groups with too little delivery are marked so the UI
 * never crowns a "best" text on a handful of impressions.
 */

export type CopyGroup = {
  key: string;
  ads: number;
  current: Derived;
  base: BaseMetrics;
  enoughData: boolean;
};

export const INSTANT_FORM_URL = "http://fb.me/";

export function groupBy<T>(
  items: T[],
  keyOf: (t: T) => string | null | undefined,
  baseOf: (t: T) => BaseMetrics,
  minImpressions = 1000,
): CopyGroup[] {
  const map = new Map<string, { ads: number; bases: BaseMetrics[] }>();
  for (const it of items) {
    const key = keyOf(it)?.trim();
    if (!key) continue;
    const g = map.get(key) ?? { ads: 0, bases: [] };
    g.ads++;
    g.bases.push(baseOf(it));
    map.set(key, g);
  }
  return [...map.entries()]
    .map(([key, g]) => {
      const base = sumBase(g.bases);
      return { key, ads: g.ads, base, current: derive(base), enoughData: base.impressions >= minImpressions };
    })
    .sort((a, b) => b.base.spend - a.base.spend);
}

/** Best group by efficiency among groups with enough data (needs ≥2 comparable groups). */
export function bestGroup(groups: CopyGroup[], efficiency: "cpr" | "roas"): CopyGroup | null {
  const eligible = groups.filter((g) => g.enoughData && (efficiency === "roas" ? g.current.roas != null : g.current.cpr != null));
  if (eligible.length < 2) return null;
  return [...eligible].sort((a, b) =>
    efficiency === "roas" ? (b.current.roas ?? 0) - (a.current.roas ?? 0) : (a.current.cpr ?? Infinity) - (b.current.cpr ?? Infinity),
  )[0];
}

export function describeDestination(url: string | null | undefined): string {
  if (!url) return "Post engagement / no link";
  if (url === INSTANT_FORM_URL) return "Instant form (on Meta)";
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function isInstantForm(url: string | null | undefined): boolean {
  return url === INSTANT_FORM_URL;
}
