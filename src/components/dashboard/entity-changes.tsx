import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { CATEGORY_LABEL, type ChangeCategory } from "@/server/analytics/activity";

type Change = {
  id: string;
  changedAt: Date;
  category: string;
  action: string;
  actorName: string | null;
  adName: string | null;
  adsetName: string | null;
  campaignName: string | null;
  previousValue: string | null;
  newValue: string | null;
};

export function EntityChanges({ changes, changelogHref }: { changes: Change[]; changelogHref: string }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Changes made here</CardTitle>
          <CardDescription>From Meta&apos;s change history (synced automatically)</CardDescription>
        </div>
        <Link prefetch={false} href={changelogHref} className="text-xs text-primary hover:underline">
          Full changelog with impact →
        </Link>
      </CardHeader>
      <CardContent className="pt-1">
        {changes.length ? (
          <ul className="divide-y divide-border text-sm">
            {changes.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{CATEGORY_LABEL[c.category as ChangeCategory] ?? c.category}</Badge>
                  <span className="font-medium">{c.action}</span>
                  {(c.previousValue || c.newValue) && (
                    <span className="text-xs text-muted-foreground">
                      {c.previousValue ?? "—"} → <span className="font-medium text-foreground">{c.newValue ?? "—"}</span>
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.actorName ?? "Unknown"} · {formatRelativeTime(c.changedAt)}
                  {(c.adName ?? c.adsetName ?? c.campaignName) && ` · ${c.adName ?? c.adsetName ?? c.campaignName}`}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No changes recorded in the last 90 days.</p>
        )}
      </CardContent>
    </Card>
  );
}
