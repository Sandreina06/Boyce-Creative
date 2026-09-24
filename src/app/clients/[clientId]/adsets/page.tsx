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

export default async function AdSetsPage(props: PageProps<"/clients/[clientId]/adsets">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;
  const campaignId = typeof params.campaign === "string" ? params.campaign : null;
  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const r = await settle(getEntityTable(ctx, dates, "adset", { campaignId }));
  if (!r.ok) return <SectionError title="Ad sets" message={r.error} />;
  const t = r.data;
  const campaignName = campaignId ? t.rows[0]?.campaignName : null;
  return (
    <>
      <PageStatus
        left={
          <>
            <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
            {dates.comparison && ` vs ${formatRange(dates.comparison)}`}
            {campaignId && (
              <>
                {" "}
                · filtered to campaign <span className="font-medium text-foreground">{campaignName ?? campaignId}</span> ·{" "}
                <Link prefetch={false} className="text-primary hover:underline" href={`/clients/${clientId}/adsets?${dateQuery(params)}`}>
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
            <CardTitle>Ad sets</CardTitle>
            <CardDescription>Learning status and targeting come from Meta via Windsor. Click an ad set for targeting, trend and its ads.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          <EntityTableView
            rows={t.rows}
            columns={columnsFor(ctx, "adset")}
            currency={ctx.settings.currency}
            hrefBase={`/clients/${clientId}/adsets/`}
            query={dateQuery(params)}
            showParents="campaign"
            showBudget
            entityLabel="Ad set"
          />
        </CardContent>
      </Card>
    </>
  );
}
