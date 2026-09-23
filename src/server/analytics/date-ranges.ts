/**
 * Date presets and the comparison engine.
 *
 * All dates are calendar dates (YYYY-MM-DD) in the *client's* timezone, which is
 * how Meta reports ad account data. Arithmetic is done on UTC-midnight
 * timestamps so DST never shifts a day.
 */

export const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7d", label: "Last 7 days" },
  { id: "last_14d", label: "Last 14 days" },
  { id: "last_30d", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom" },
] as const;

export const COMPARE_MODES = [
  { id: "previous_period", label: "Previous period" },
  { id: "previous_month", label: "Previous month" },
  { id: "previous_year", label: "Previous year" },
  { id: "none", label: "No comparison" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["id"];
export type CompareMode = (typeof COMPARE_MODES)[number]["id"];
export type DateRange = { from: string; to: string };

export const DEFAULT_PRESET: DatePreset = "last_30d";
export const DEFAULT_COMPARE: CompareMode = "previous_period";

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isPreset = (v: unknown): v is DatePreset => DATE_PRESETS.some((p) => p.id === v);
export const isCompareMode = (v: unknown): v is CompareMode => COMPARE_MODES.some((p) => p.id === v);
export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Today's calendar date in an IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Fraction of the current day elapsed in a timezone (0–1). */
export function dayFractionIn(timezone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h * 60 + m) / 1440;
}

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  return fromMs(toMs(d) + n * DAY);
}

export function daysBetweenInclusive(r: DateRange): number {
  return Math.round((toMs(r.to) - toMs(r.from)) / DAY) + 1;
}

export function daysInMonth(d: string): number {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: string): string {
  return `${d.slice(0, 7)}-${String(daysInMonth(d)).padStart(2, "0")}`;
}

/** Shift a date by whole months, clamping the day to the target month's length. */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const dim = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`;
}

const isFullMonth = (r: DateRange) => r.from === startOfMonth(r.from) && r.to === endOfMonth(r.from);

/**
 * Resolve a preset to a concrete range. "Last N days" excludes today, matching
 * Meta Ads Manager; "This month" includes today.
 */
export function resolveRange(preset: DatePreset, today: string, custom?: Partial<DateRange>): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last_7d":
      return { from: addDays(today, -7), to: addDays(today, -1) };
    case "last_14d":
      return { from: addDays(today, -14), to: addDays(today, -1) };
    case "last_30d":
      return { from: addDays(today, -30), to: addDays(today, -1) };
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case "custom": {
      if (custom && isIsoDate(custom.from) && isIsoDate(custom.to)) {
        const from = custom.from <= custom.to ? custom.from : custom.to;
        const to = custom.from <= custom.to ? custom.to : custom.from;
        return { from, to: to > today ? today : to };
      }
      return resolveRange(DEFAULT_PRESET, today);
    }
  }
}

/** The comparison range for a given range, or null for "none". */
export function resolveComparison(range: DateRange, mode: CompareMode): DateRange | null {
  switch (mode) {
    case "none":
      return null;
    case "previous_period": {
      const len = daysBetweenInclusive(range);
      return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
    }
    case "previous_month": {
      if (isFullMonth(range)) {
        const prev = addMonths(range.from, -1);
        return { from: prev, to: endOfMonth(prev) };
      }
      return { from: addMonths(range.from, -1), to: addMonths(range.to, -1) };
    }
    case "previous_year": {
      if (isFullMonth(range)) {
        const prev = addMonths(range.from, -12);
        return { from: prev, to: endOfMonth(prev) };
      }
      return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
    }
  }
}

export type ResolvedDates = {
  preset: DatePreset;
  compare: CompareMode;
  range: DateRange;
  comparison: DateRange | null;
  today: string;
};

/** Parse URL search params into validated, resolved ranges for a timezone. */
export function resolveDatesFromParams(
  params: Record<string, string | string[] | undefined>,
  timezone: string,
  now: Date = new Date(),
): ResolvedDates {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const presetParam = first(params.range);
  const compareParam = first(params.compare);
  const preset: DatePreset = isPreset(presetParam) ? presetParam : DEFAULT_PRESET;
  const compare: CompareMode = isCompareMode(compareParam) ? compareParam : DEFAULT_COMPARE;
  const today = todayIn(timezone, now);
  const range = resolveRange(preset, today, { from: first(params.from), to: first(params.to) });
  return { preset, compare, range, comparison: resolveComparison(range, compare), today };
}

export function formatRange(r: DateRange): string {
  const fmt = (d: string, withYear: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  if (r.from === r.to) return fmt(r.from, true);
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${fmt(r.from, !sameYear)} – ${fmt(r.to, true)}`;
}
