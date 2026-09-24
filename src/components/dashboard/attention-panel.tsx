"use client";

import { AlertOctagon, AlertTriangle, Info, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Alert, AlertSeverity } from "@/server/analytics/attention";
import { cn } from "@/lib/utils";

export type AttentionItem = { key: string; clientName?: string; href?: string; alert: Alert };

const ICON = { critical: AlertOctagon, warning: AlertTriangle, opportunity: Lightbulb, info: Info } as const;
const TONE = { critical: "text-critical", warning: "text-warning", opportunity: "text-good", info: "text-primary" } as const;
const TABS: { id: "all" | AlertSeverity; label: string; active: string }[] = [
  { id: "all", label: "All", active: "border-foreground text-foreground" },
  { id: "critical", label: "Critical", active: "border-critical text-critical" },
  { id: "warning", label: "Warnings", active: "border-warning text-warning-foreground" },
  { id: "opportunity", label: "Opportunities", active: "border-good text-good" },
];

/** Needs Attention with severity tabs and progressive "Show more". */
export function AttentionPanel({ items, pageSize = 5 }: { items: AttentionItem[]; pageSize?: number }) {
  const firstTab = items.some((i) => i.alert.severity === "critical") ? "critical" : "all";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>(firstTab);
  const [shown, setShown] = useState(pageSize);

  const count = (id: (typeof TABS)[number]["id"]) => (id === "all" ? items.length : items.filter((i) => i.alert.severity === id).length);
  const list = tab === "all" ? items : items.filter((i) => i.alert.severity === tab);
  const visible = list.slice(0, shown);

  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing needs attention for the selected period.</p>;

  return (
    <div>
      <div role="tablist" aria-label="Filter by severity" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const n = count(t.id);
          if (t.id !== "all" && !n) return null;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setTab(t.id);
                setShown(pageSize);
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                on ? `font-semibold ${t.active}` : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-border">
        {visible.map(({ key, clientName, href, alert }) => {
          const Icon = ICON[alert.severity];
          const body = (
            <div className="flex items-start gap-3 py-2.5">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[alert.severity])} aria-hidden />
              <div className="min-w-0">
                <div className="text-sm">
                  {clientName && <span className="font-semibold">{clientName} · </span>}
                  <span className={cn(!clientName && "font-medium")}>{alert.title}</span>
                </div>
                {alert.detail && <div className="text-xs text-muted-foreground">{alert.detail}</div>}
                {alert.recommendation && <div className="mt-0.5 text-xs">→ {alert.recommendation}</div>}
              </div>
            </div>
          );
          return (
            <li key={key}>
              {href ? (
                <Link prefetch={false} href={href} className="block rounded-md px-1 hover:bg-muted/60">
                  {body}
                </Link>
              ) : (
                <div className="px-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
        <span>
          Showing {visible.length} of {list.length}
        </span>
        <div className="flex gap-3">
          {shown > pageSize && (
            <button onClick={() => setShown(pageSize)} className="font-medium hover:text-foreground">
              Show less
            </button>
          )}
          {list.length > shown && (
            <button onClick={() => setShown((n) => n + pageSize * 2)} className="rounded-md border border-border px-3 py-1 font-semibold text-foreground hover:bg-muted">
              Show more ({list.length - shown})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
