"use client";

import { useEffect, useState } from "react";

/**
 * Loading state for data pages: skeleton layout plus a message that explains
 * what is happening and escalates if it takes long, never a silent wait.
 */
export function PageLoading({ what = "this page" }: { what?: string }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  const message =
    s < 5
      ? `Loading ${what}…`
      : s < 25
        ? `Fetching live data from Meta via Windsor (${s}s). The first load of a client or date range can take up to 30 seconds; after that it's instant.`
        : s < 60
          ? `Still waiting on Windsor (${s}s). Their API is slower than usual right now.`
          : `Windsor hasn't responded after ${s}s. You can reload to try again; the dashboard keeps retrying in the background.`;

  return (
    <div className="space-y-6" aria-busy="true">
      <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <span className="flex-1">{message}</span>
        {s >= 60 && (
          <button onClick={() => location.reload()} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            Reload
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-card ring-1 ring-border/60">
            <div className="m-4 h-3 w-20 rounded bg-muted" />
            <div className="mx-4 h-6 w-28 rounded bg-muted" />
            <div className="m-4 h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-card ring-1 ring-border/60">
        <div className="m-5 h-3 w-40 rounded bg-muted" />
      </div>
      <div className="space-y-2 rounded-xl bg-card p-5 ring-1 ring-border/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}
