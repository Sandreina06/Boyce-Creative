"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatValue } from "@/lib/format";
import type { MetricFormat } from "@/server/analytics/metrics";

export type TrendDatum = { date: string; spend: number; results: number; cpr: number | null };

type Props = { data: TrendDatum[]; currency: string; resultLabel: string; cprLabel: string };

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Spend, results and cost per result as aligned small multiples sharing one
 * x-axis — deliberately not a dual-axis chart.
 */
export function TrendCharts({ data, currency, resultLabel, cprLabel }: Props) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No delivery in this period.</p>;
  }
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <MiniChart title="Spend" data={data} dataKey="spend" format="currency" currency={currency} kind="bar" />
      <MiniChart title={resultLabel} data={data} dataKey="results" format="integer" currency={currency} kind="bar" />
      <MiniChart title={cprLabel} data={data} dataKey="cpr" format="currency" currency={currency} kind="line" />
    </div>
  );
}

function MiniChart({
  title,
  data,
  dataKey,
  format,
  currency,
  kind,
}: {
  title: string;
  data: TrendDatum[];
  dataKey: keyof TrendDatum;
  format: MetricFormat;
  currency: string;
  kind: "bar" | "line";
}) {
  const tick = (v: number) => formatValue(format, v, currency).replace(/\.00$/, "");
  const common = {
    data,
    margin: { top: 4, right: 4, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
      <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
      <YAxis tickFormatter={tick} tick={AXIS} tickLine={false} axisLine={false} width={56} />
      <Tooltip
        cursor={kind === "bar" ? { fill: "var(--muted)" } : { stroke: "var(--muted-foreground)", strokeWidth: 1 }}
        content={({ active, payload, label }) =>
          active && payload?.length ? (
            <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
              <div className="text-muted-foreground">{shortDate(String(label))}</div>
              <div className="font-semibold tabular-nums">
                {title}: {formatValue(format, payload[0].value as number | null, currency)}
              </div>
            </div>
          ) : null
        }
      />
    </>
  );
  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold text-muted-foreground">{title}</figcaption>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart {...common} barCategoryGap={2}>
              {axes}
              <Bar dataKey={dataKey} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          ) : (
            <LineChart {...common}>
              {axes}
              <Line
                dataKey={dataKey}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                connectNulls={false}
                type="monotone"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
