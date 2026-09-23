import type { Direction } from "./metrics";

export type Trend = "up" | "down" | "flat";
export type Sentiment = "good" | "bad" | "neutral";

export type Comparison = {
  current: number | null;
  previous: number | null;
  /** current − previous */
  abs: number | null;
  /** (current − previous) / |previous| × 100; null when previous is 0 or missing. */
  pct: number | null;
  trend: Trend;
  sentiment: Sentiment;
};

/** Changes smaller than this (in %) are shown as flat. */
export const FLAT_THRESHOLD_PCT = 0.5;

export function compareValues(
  current: number | null,
  previous: number | null,
  direction: Direction,
): Comparison {
  const abs = current != null && previous != null ? current - previous : null;
  const pct = abs != null && previous ? (abs / Math.abs(previous)) * 100 : null;

  let trend: Trend = "flat";
  if (abs != null) {
    if (pct != null ? Math.abs(pct) >= FLAT_THRESHOLD_PCT : abs !== 0) trend = abs > 0 ? "up" : "down";
  }

  let sentiment: Sentiment = "neutral";
  if (trend !== "flat" && direction !== "neutral") {
    const improved = direction === "higher_better" ? trend === "up" : trend === "down";
    sentiment = improved ? "good" : "bad";
  }

  return { current, previous, abs, pct, trend, sentiment };
}
