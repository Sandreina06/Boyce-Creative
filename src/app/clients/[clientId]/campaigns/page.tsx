import { EntityTableView } from "@/components/dashboard/entity-table";
import { PageStatus } from "@/components/dashboard/page-status";
import { SectionError, settle } from "@/components/dashboard/section-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateQuery } from "@/lib/qs";
import { requireClientAccess } from "@/server/auth/access";
import { formatRange, resolveDatesFromParams } from "@/server/analytics/date-ranges";
import { columnsFor } from "@/server/services/entity-columns";
import { getEntityTable } from "@/server/services/entities";

export default async function CampaignsPage(props: PageProps<"/clients/[clientId]/campaigns">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  const params = await props.searchParams;
  if (!ctx.accountIds.length) return <p className="text-sm text-muted-foreground">No Meta ad account mapped.</p>;
  const dates = resolveDatesFromParams(params, ctx.settings.timezone);
  const r = await settle(getEntityTable(ctx, dates, "campaign"));
  if (!r.ok) return <SectionError title="Campaigns" message={r.error} />;
  const t = r.data;
  return (
    <>
      <PageStatus
        left={
          <>
            <span className="font-medium text-foreground">{formatRange(dates.range)}</span>
            {dates.comparison && ` vs ${formatRange(dates.comparison)}`} · click a campaign to drill into its ad sets and ads
          </>
        }
        meta={t.meta}
        clientId={ctx.client.id}
        canRefresh={!ctx.user.isGuest}
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>Campaigns with delivery in the period. Flags come from the same rules as Insights.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-2">
          <EntityTableView
            rows={t.rows}
            columns={columnsFor(ctx, "campaign")}
            currency={ctx.settings.currency}
            hrefBase={`/clients/${clientId}/campaigns/`}
            query={dateQuery(params)}
            showBudget
            entityLabel="Campaign"
          />
        </CardContent>
      </Card>
    </>
  );
}
