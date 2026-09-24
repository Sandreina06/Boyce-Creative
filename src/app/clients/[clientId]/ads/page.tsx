import Link from "next/link";
import { EntityTableView } from "@/components/dashboard/entity-table";
import { PageStatus } from "@/components/dashboard/page-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateQuery } from "@/lib/qs";
import { requireClientAccess } from "@/server/auth/access";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { columnsFor } from "@/server/services/entity-columns";
import { getEntityTable } from "@/server/services/entities";

export default async function AdsPage(props: PageProps<"/clients/[clientId]/ads">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;
  const campaignId = typeof params.campaign === "string" ? params.campaign : null;
  const adsetId = typeof params.adset === "string" ? params.adset : null;
  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const r = await settle(getEntityTable(ctx, dates, "ad", { campaignId, adsetId }));
  if (!r.ok) return <SectionError title="Ads" message={r.error} />;
  const t = r.data;
  const scope = adsetId ? `ad set ${t.rows[0]?.adsetName ?? adsetId}` : campaignId ? `campaign ${t.rows[0]?.campaignName ?? campaignId}` : null;
  return (
    <>
      <PageStatus
        left={
          <>
            <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
            {dates.comparison && ` vs ${formatRange(dates.comparison)}`}
            {scope && (
              <>
                {" "}
                · filtered to <span className="font-medium text-foreground">{scope}</span> ·{" "}
                <Link prefetch={false} className="text-primary hover:underline" href={`/clients/${clientId}/ads?${dateQuery(params)}`}>
                  show all
                </Link>
              </>
            )}
          </>
        }
        meta={t.meta}
        clientId={ctx.client.id}
        canRefresh={!ctx.user.isGuest}
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ads</CardTitle>
            <CardDescription>
              Flags highlight high spend with low performance, high cost per result, low CTR, high frequency and creative labels. Full creative
              analysis is on the{" "}
              <Link prefetch={false} className="text-primary hover:underline" href={`/clients/${clientId}/creative?${dateQuery(params)}`}>
                Creative
              </Link>{" "}
              page.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          <EntityTableView rows={t.rows} columns={columnsFor(ctx, "ad")} currency={ctx.settings.currency} showParents="both" entityLabel="Ad" />
        </CardContent>
      </Card>
    </>
  );
}
