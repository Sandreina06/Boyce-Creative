import { Card } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import type { Comparison } from "@/server/analytics/compare";
import type { MetricKey } from "@/server/analytics/metrics";
import { Delta } from "./delta";

/** Compact KPI strip for a campaign / ad set drilldown. */
export function EntitySummary({
  items,
  currency,
}: {
  items: { key: MetricKey; label: string; c: Comparison | undefined; value: number | null }[];
  currency: string;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {items.map((i) => (
        <Card key={i.key} className="p-3">
          <div className="text-[11px] font-medium text-muted-foreground">{i.label}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatMetric(i.key, i.value, currency)}</div>
          {i.c && <Delta c={i.c} />}
        </Card>
      ))}
    </section>
  );
}
