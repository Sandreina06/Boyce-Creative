/**
 * Human-readable summary of Meta's adset_targeting JSON (as returned by Windsor).
 * Structure verified on real Beechwood / Edwards / Robertson / TW's ad sets.
 */
export type TargetingSummary = {
  ages: string | null;
  genders: string | null;
  locations: string[];
  excludedLocations: number;
  interests: string[];
  advantageAudience: boolean | null;
  placements: string | null;
};

type Geo = {
  cities?: { name?: string; region?: string; radius?: number; distance_unit?: string }[];
  regions?: { name?: string }[];
  zips?: { name?: string }[];
  medium_geo_areas?: { name?: string; region?: string }[];
  custom_locations?: { name?: string; address_string?: string; radius?: number; distance_unit?: string; latitude?: number; longitude?: number }[];
  countries?: string[];
};

export function summarizeTargeting(raw: string | null | undefined): TargetingSummary | null {
  if (!raw) return null;
  let t: Record<string, unknown>;
  try {
    t = JSON.parse(raw);
  } catch {
    return null;
  }
  const geo = (t.geo_locations ?? {}) as Geo;
  const excluded = (t.excluded_geo_locations ?? {}) as Geo;
  const mi = (r?: number, u?: string) => (r ? ` +${r}${u === "kilometer" ? "km" : "mi"}` : "");
  const locations = [
    ...(geo.cities ?? []).map((c) => `${c.name}${c.region ? `, ${abbr(c.region)}` : ""}${mi(c.radius, c.distance_unit)}`),
    ...(geo.medium_geo_areas ?? []).map((m) => `${m.name}${m.region ? `, ${abbr(m.region)}` : ""}`),
    ...(geo.regions ?? []).map((r) => r.name ?? ""),
    ...(geo.zips ?? []).map((z) => `ZIP ${z.name}`),
    ...(geo.custom_locations ?? []).map((c) => `${c.name ?? c.address_string ?? `Pin ${c.latitude?.toFixed(2)},${c.longitude?.toFixed(2)}`}${mi(c.radius, c.distance_unit)}`),
    ...(geo.countries ?? []),
  ].filter(Boolean);
  const excludedLocations = Object.values(excluded).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);

  const flex = (t.flexible_spec ?? []) as { interests?: { name?: string }[]; behaviors?: { name?: string }[] }[];
  const interests = flex.flatMap((f) => [...(f.interests ?? []), ...(f.behaviors ?? [])].map((i) => i.name ?? "")).filter(Boolean);

  const genders = Array.isArray(t.genders) ? ((t.genders as number[]).includes(1) && !(t.genders as number[]).includes(2) ? "Men" : (t.genders as number[]).includes(2) && !(t.genders as number[]).includes(1) ? "Women" : "All") : "All";
  const auto = t.targeting_automation as { advantage_audience?: number } | undefined;
  const platforms = t.publisher_platforms as string[] | undefined;

  return {
    ages: t.age_min || t.age_max ? `${t.age_min ?? 18}–${t.age_max ?? 65}${t.age_max === 65 ? "+" : ""}` : null,
    genders,
    locations,
    excludedLocations,
    interests,
    advantageAudience: auto?.advantage_audience == null ? null : auto.advantage_audience === 1,
    placements: platforms?.length ? platforms.join(", ") : "Advantage+ placements",
  };
}

const STATES: Record<string, string> = { "North Carolina": "NC", Virginia: "VA", "South Carolina": "SC" };
const abbr = (s: string) => STATES[s] ?? s;
