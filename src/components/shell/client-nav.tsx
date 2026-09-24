"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  ["overview", "Overview"],
  ["campaigns", "Campaigns"],
  ["adsets", "Ad sets"],
  ["ads", "Ads"],
  ["creative", "Creative"],
  ["pacing", "Pacing"],
  ["insights", "Insights"],
  ["changelog", "Changelog"],
  ["settings", "Settings"],
] as const;

export function ClientNav({ clientId, showSettings }: { clientId: string; showSettings: boolean }) {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  // Highlight the tab you clicked immediately, before its page has loaded.
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null);
  const pendingHref = clicked && clicked.from === pathname ? clicked.href : null;
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {SECTIONS.filter(([slug]) => showSettings || slug !== "settings").map(([slug, label]) => {
        const href = `/clients/${clientId}/${slug}`;
        const active = pendingHref ? pendingHref === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link prefetch={false}
            key={slug}
            href={`${href}${qs ? `?${qs}` : ""}`}
            onClick={() => setClicked({ href, from: pathname })}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <TabLabel label={label} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Shows a spinner on the tab you just clicked until its page is ready. */
function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {pending && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
    </span>
  );
}
