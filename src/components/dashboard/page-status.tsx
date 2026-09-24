import { DataStatus } from "@/components/shell/data-status";
import type { DataMeta } from "@/server/services/data-meta";

export function PageStatus({ left, meta, clientId, canRefresh }: { left: React.ReactNode; meta: DataMeta; clientId: string; canRefresh: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">{left}</div>
      <DataStatus
        source={meta.source}
        fetchedAt={meta.fetchedAt.toISOString()}
        fromCache={meta.fromCache}
        stale={meta.stale}
        clientId={clientId}
        canRefresh={canRefresh}
      />
    </div>
  );
}
