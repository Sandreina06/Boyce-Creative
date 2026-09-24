"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMetric, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MetricKey } from "@/server/analytics/metrics";
import type { EntityRow } from "@/server/services/entities";

export type Column = { key: MetricKey; label: string };

type Props = {
  rows: EntityRow[];
  columns: Column[];
  currency: string;
  /** Link for a row's name, e.g. "/clients/x/campaigns/" + id + qs. Omit for no link. */
  hrefBase?: string;
  query?: string;
  showParents?: "campaign" | "adset" | "both";
  showBudget?: boolean;
  entityLabel: string;
};

const STATUS_GROUP = (s: string | null) => (s === "ACTIVE" ? "active" : s ? "inactive" : "unknown");

export function EntityTableView({ rows, columns, currency, hrefBase, query, showParents, showBudget, entityLabel }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [flagged, setFlagged] = useState(false);
  const [sort, setSort] = useState<{ key: MetricKey | "name"; dir: "asc" | "desc" }>({ key: "spend", dir: "desc" });
  const [compare, setCompare] = useState(true);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!needle || [r.name, r.campaignName, r.adsetName, r.id].some((v) => v?.toLowerCase().includes(needle))) &&
        (status === "all" || STATUS_GROUP(r.status) === status) &&
        (!flagged || r.flags.length > 0),
    );
    const val = (r: EntityRow) => (sort.key === "name" ? r.name.toLowerCase() : (r.current[sort.key] ?? -Infinity));
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, q, status, flagged, sort]);

  const toggleSort = (key: MetricKey | "name") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${entityLabel.toLowerCase()}s`} className="w-64 pl-8" />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status filter">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Paused / inactive</option>
        </NativeSelect>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Flagged only
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Show change vs comparison
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {shown.length} of {rows.length} {entityLabel.toLowerCase()}s
        </span>
      </div>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>
              <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 uppercase">
                {entityLabel} <SortIcon active={sort.key === "name"} dir={sort.dir} />
              </button>
            </TH>
            {showBudget && <TH className="text-right">Budget</TH>}
            {columns.map((c) => (
              <TH key={c.key} className="text-right">
                <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase">
                  {c.label} <SortIcon active={sort.key === c.key} dir={sort.dir} />
                </button>
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {shown.map((r) => (
            <TR key={r.id}>
              <TD className="max-w-80 whitespace-normal">
                {hrefBase ? (
                  <Link prefetch={false} href={`${hrefBase}${r.id}${query ? `?${query}` : ""}`} className="font-medium hover:text-primary">
                    {r.name}
                  </Link>
                ) : (
                  <span className="font-medium">{r.name}</span>
                )}
                {showParents && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {showParents !== "adset" && r.campaignName}
                    {showParents === "both" && r.adsetName && ` › ${r.adsetName}`}
                    {showParents === "adset" && r.adsetName}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.status && (
                    <Badge variant={r.status === "ACTIVE" ? "good" : "default"}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>
                  )}
                  {r.objective && <Badge>{r.objective.replace("OUTCOME_", "").toLowerCase()}</Badge>}
                  {r.flags.map((f) => (
                    <Badge key={f.label} variant={f.tone === "good" ? "good" : f.tone === "critical" ? "critical" : f.tone === "warning" ? "warning" : "info"}>
                      {f.label}
                    </Badge>
                  ))}
                </div>
              </TD>
              {showBudget && (
                <TD className="text-right text-xs">
                  {r.dailyBudget ? `${formatMetric("spend", r.dailyBudget, currency)}/day` : r.lifetimeBudget ? `${formatMetric("spend", r.lifetimeBudget, currency)} lifetime` : <span className="text-muted-foreground">—</span>}
                </TD>
              )}
              {columns.map((c) => {
                const ch = r.changes[c.key];
                return (
                  <TD key={c.key} className="text-right">
                    <div>{formatMetric(c.key, r.current[c.key], currency)}</div>
                    {compare && ch && ch.pct != null && ch.trend !== "flat" && (
                      <div className={cn("text-[11px]", ch.sentiment === "good" ? "text-good" : ch.sentiment === "bad" ? "text-critical" : "text-muted-foreground")}>
                        {formatPct(ch.pct, 0)}
                      </div>
                    )}
                  </TD>
                );
              })}
            </TR>
          ))}
          {!shown.length && (
            <TR>
              <TD colSpan={columns.length + 2} className="py-8 text-center text-muted-foreground">
                No {entityLabel.toLowerCase()}s match these filters.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return null;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}
