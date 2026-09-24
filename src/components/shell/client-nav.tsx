"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {SECTIONS.filter(([slug]) => showSettings || slug !== "settings").map(([slug, label]) => {
        const href = `/clients/${clientId}/${slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link prefetch={false}
            key={slug}
            href={`${href}${qs ? `?${qs}` : ""}`}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
