"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Other components (selects, buttons using router.push) call this to show the same feedback. */
export function startNavigationFeedback() {
  window.dispatchEvent(new Event("bmi:navigate"));
}

/**
 * Instant feedback for every navigation: a progress bar at the top of the screen,
 * then a small status message if the page takes a while, escalating with time.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const routeKey = `${pathname}?${search}`;
  // The route we were on when navigation started; once the route changes, it's done.
  const [startedOn, setStartedOn] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const current = useRef(routeKey);
  useEffect(() => {
    current.current = routeKey;
  }, [routeKey]);
  const pending = startedOn != null && startedOn === routeKey;

  useEffect(() => {
    const start = () => {
      started.current = Date.now();
      setElapsed(0);
      setStartedOn(current.current);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("bmi:navigate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("bmi:navigate", start);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/15" role="progressbar" aria-label="Loading page">
        <div className="h-full w-1/3 animate-[bmi-progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      {elapsed >= 1 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg"
        >
          <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent align-[-1px]" />
          {elapsed < 8
            ? "Loading…"
            : elapsed < 30
              ? `Fetching fresh data from Meta via Windsor… ${elapsed}s`
              : `Still waiting on Windsor (${elapsed}s). You can keep waiting or `}
          {elapsed >= 30 && (
            <button className="font-semibold text-primary underline" onClick={() => location.reload()}>
              reload
            </button>
          )}
        </div>
      )}
    </>
  );
}
