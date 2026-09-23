import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Comparison } from "@/server/analytics/compare";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Direction arrow + % change, coloured by whether the move is good or bad for this metric. */
export function Delta({ c, className }: { c: Comparison; className?: string }) {
  if (c.previous == null) return <span className={cn("text-xs text-muted-foreground", className)}>No comparison</span>;
  const Icon = c.trend === "up" ? ArrowUpRight : c.trend === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
        c.sentiment === "good" && "text-good",
        c.sentiment === "bad" && "text-critical",
        c.sentiment === "neutral" && "text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {c.pct == null ? "n/a" : formatPct(c.pct)}
      <span className="sr-only">{c.sentiment === "good" ? "(improved)" : c.sentiment === "bad" ? "(worse)" : ""}</span>
    </span>
  );
}
