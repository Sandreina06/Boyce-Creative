import { AlertOctagon, AlertTriangle, Info, Lightbulb } from "lucide-react";
import Link from "next/link";
import type { Alert } from "@/server/analytics/attention";
import { cn } from "@/lib/utils";

const ICON = { critical: AlertOctagon, warning: AlertTriangle, opportunity: Lightbulb, info: Info } as const;
const TONE = { critical: "text-critical", warning: "text-warning", opportunity: "text-good", info: "text-primary" } as const;
const LABEL = { critical: "Critical", warning: "Warning", opportunity: "Opportunity", info: "Info" } as const;

export function AttentionList({
  items,
  hrefFor,
}: {
  items: { key: string; clientName?: string; alert: Alert; clientId?: string }[];
  hrefFor?: (clientId: string) => string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing needs attention for the selected period.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map(({ key, clientName, clientId, alert }) => {
        const Icon = ICON[alert.severity];
        const body = (
          <div className="flex items-start gap-3 py-2.5">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[alert.severity])} aria-hidden />
            <div className="min-w-0">
              <div className="text-sm">
                <span className="sr-only">{LABEL[alert.severity]}: </span>
                {clientName && <span className="font-semibold">{clientName} · </span>}
                <span className={cn(!clientName && "font-medium")}>{alert.title}</span>
              </div>
              <div className="text-xs text-muted-foreground">{alert.detail}</div>
              {alert.recommendation && <div className="mt-0.5 text-xs">→ {alert.recommendation}</div>}
            </div>
          </div>
        );
        return (
          <li key={key}>
            {clientId && hrefFor ? (
              <Link prefetch={false} href={hrefFor(clientId)} className="block rounded-md px-1 hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div className="px-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
