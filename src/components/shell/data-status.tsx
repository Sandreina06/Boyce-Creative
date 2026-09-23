"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { refreshData } from "@/app/actions/refresh";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";

type Props = {
  source: "windsor" | "demo";
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
  clientId: string | null;
  canRefresh: boolean;
};

/** "Last updated X min ago" — never claims real-time. */
export function DataStatus({ source, fetchedAt, stale, clientId, canRefresh }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {source === "demo" ? (
        <Badge variant="demo">Demo data</Badge>
      ) : (
        <Badge variant="info">Windsor · Meta Ads</Badge>
      )}
      <span title={new Date(fetchedAt).toLocaleString()}>
        Last updated {formatRelativeTime(fetchedAt)}
      </span>
      {stale && <Badge variant="warning">Windsor unavailable — showing last saved data</Badge>}
      {canRefresh && (
      <button
        type="button"
        onClick={() =>
          start(async () => {
            await refreshData(clientId);
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground"
        disabled={pending}
      >
        <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        {pending ? "Refreshing" : "Refresh"}
      </button>
      )}
    </div>
  );
}
