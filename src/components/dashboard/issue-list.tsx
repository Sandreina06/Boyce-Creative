import { AlertOctagon, AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { Issue } from "@/server/analytics/health";
import type { StrategyIssue } from "@/server/analytics/strategy";
import { cn } from "@/lib/utils";

const META = {
  critical: { Icon: AlertOctagon, tone: "text-critical", label: "Critical" },
  warning: { Icon: AlertTriangle, tone: "text-warning", label: "Warning" },
  opportunity: { Icon: Lightbulb, tone: "text-good", label: "Opportunity" },
  info: { Icon: Info, tone: "text-primary", label: "Info" },
} as const;

const CATEGORY: Record<Issue["category"], string> = {
  performance: "Performance",
  budget: "Budget",
  creative: "Creative",
  structure: "Structure",
  delivery: "Delivery",
  tracking: "Tracking",
  strategy: "Strategy",
};

export function IssueList({ issues, compact = false }: { issues: (Issue | StrategyIssue)[]; compact?: boolean }) {
  if (!issues.length) return <p className="text-sm text-muted-foreground">No issues found for the selected period.</p>;
  return (
    <ul className="divide-y divide-border">
      {issues.map((i) => {
        const m = META[i.severity];
        const sources = "sources" in i ? i.sources : undefined;
        return (
          <li key={i.id} className="flex gap-3 py-3">
            <m.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", m.tone)} aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="sr-only">{m.label}: </span>
                <span className="text-sm font-semibold">{i.title}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {m.label} · {CATEGORY[i.category]}
                </span>
              </div>
              {!compact && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {i.evidence.map((e, k) => (
                    <li key={k} className="whitespace-pre-line">
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              <p className={cn("text-xs", !compact && "rounded-md bg-muted/60 px-3 py-2")}>
                {!compact && <span className="font-semibold">Recommendation: </span>}
                {i.recommendation}
              </p>
              {!compact && sources?.length ? (
                <p className="text-[11px] text-muted-foreground">
                  Benchmark source{sources.length > 1 ? "s" : ""}:{" "}
                  {sources.map((s, k) => (
                    <span key={s.url}>
                      {k > 0 && " · "}
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                        {s.title}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
