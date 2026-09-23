import type { MetricFormat, MetricKey } from "@/server/analytics/metrics";

const FORMAT_OF: Record<MetricKey, MetricFormat> = {
  spend: "currency",
  impressions: "integer",
  reach: "integer",
  frequency: "decimal",
  clicks: "integer",
  linkClicks: "integer",
  ctr: "percent",
  cpc: "currency",
  cpm: "currency",
  results: "integer",
  cpr: "currency",
  cvr: "percent",
  revenue: "currency",
  roas: "multiplier",
};

export function formatValue(format: MetricFormat, v: number | null | undefined, currency = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
        maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
      }).format(v);
    case "integer":
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
    case "percent":
      return `${(v * 100).toFixed(2)}%`;
    case "decimal":
      return v.toFixed(2);
    case "multiplier":
      return `${v.toFixed(2)}x`;
  }
}

export function formatMetric(key: MetricKey, v: number | null | undefined, currency = "USD"): string {
  return formatValue(FORMAT_OF[key], v, currency);
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
