"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { COMPARE_MODES, DATE_PRESETS, DEFAULT_COMPARE, DEFAULT_PRESET } from "@/server/analytics/date-ranges";

export function DateControls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const preset = params.get("range") ?? DEFAULT_PRESET;
  const compare = params.get("compare") ?? DEFAULT_COMPARE;

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    start(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Date
        <NativeSelect
          value={preset}
          onChange={(e) => update({ range: e.target.value, ...(e.target.value !== "custom" ? { from: null, to: null } : {}) })}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {preset === "custom" && (
        <>
          <Input
            type="date"
            className="w-36"
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => e.target.value && update({ from: e.target.value })}
            aria-label="From"
          />
          <Input
            type="date"
            className="w-36"
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => e.target.value && update({ to: e.target.value })}
            aria-label="To"
          />
        </>
      )}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Compare
        <NativeSelect value={compare} onChange={(e) => update({ compare: e.target.value })}>
          {COMPARE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {pending && <span className="text-xs text-muted-foreground">Loading…</span>}
    </div>
  );
}
