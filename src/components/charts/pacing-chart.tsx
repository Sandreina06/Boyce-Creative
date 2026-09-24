"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatValue } from "@/lib/format";

type Point = { date: string; actual: number | null; expected: number | null };

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const day = (d: string) => String(Number(d.slice(8, 10)));

/** Cumulative spend vs even pace to budget. One currency axis; legend + direct identity. */
export function PacingChart({ data, currency }: { data: Point[]; currency: string }) {
  const hasBudget = data.some((d) => d.expected != null);
  return (
    <figure>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-chart-1" /> Actual spend (cumulative)
        </span>
        {hasBudget && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground" /> Even pace to budget
          </span>
        )}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={day} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tickFormatter={(v) => formatValue("currency", v, currency)} tick={AXIS} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
                    <div className="text-muted-foreground">Day {day(String(label))}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="tabular-nums">
                        {p.dataKey === "actual" ? "Actual" : "Even pace"}: <span className="font-semibold">{formatValue("currency", p.value as number, currency)}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            {hasBudget && <Line dataKey="expected" stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />}
            <Line dataKey="actual" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Cumulative spend this month compared with an even pace to the monthly budget.</figcaption>
    </figure>
  );
}
