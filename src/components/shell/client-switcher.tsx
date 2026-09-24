"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { NativeSelect } from "@/components/ui/input";
import { startNavigationFeedback } from "./navigation-progress";

export const LAST_CLIENT_COOKIE = "bmi_last_client";

export function ClientSwitcher({ clients, currentId }: { clients: { id: string; name: string }[]; currentId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Remember the last client so returning to it from the agency view is one click.
  useEffect(() => {
    if (currentId) document.cookie = `${LAST_CLIENT_COOKIE}=${currentId}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
  }, [currentId]);

  function go(id: string) {
    startNavigationFeedback();
    const qs = params.toString();
    if (!id) return router.push(`/agency${qs ? `?${qs}` : ""}`);
    // Keep the same section (overview, campaigns, …) when switching clients.
    const section = pathname.match(/^\/clients\/[^/]+\/([^/]+)/)?.[1] ?? "overview";
    router.push(`/clients/${id}/${section}${qs ? `?${qs}` : ""}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Client
      <NativeSelect value={currentId ?? ""} onChange={(e) => go(e.target.value)} className="min-w-44 font-medium text-foreground">
        <option value="">All clients (agency)</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
