import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { deleteTarget, setMappingActive } from "@/app/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatValue } from "@/lib/format";
import { requireClientAccess } from "@/server/auth/access";
import { db, schema } from "@/server/db";
import { todayIn } from "@/server/analytics/date-ranges";
import { KPI_OPTIONS } from "@/server/analytics/metrics";
import { ATTRIBUTION_WINDOWS, CONVERSION_FIELDS, VALUE_FIELDS } from "@/server/windsor/fields";
import { BudgetForm, MappingForm, SettingsForm, TargetForm } from "./forms";

export default async function SettingsPage(props: PageProps<"/clients/[clientId]/settings">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  if (ctx.user.isGuest) redirect("/login");
  const canEdit = ctx.user.role !== "viewer";
  const isAdmin = ctx.user.role === "admin";

  const [mappings, budgets, targets] = await Promise.all([
    db().select().from(schema.metaAccountMappings).where(eq(schema.metaAccountMappings.clientId, clientId)),
    db()
      .select()
      .from(schema.clientBudgets)
      .where(eq(schema.clientBudgets.clientId, clientId))
      .orderBy(desc(schema.clientBudgets.month))
      .limit(12),
    db().select().from(schema.clientTargets).where(eq(schema.clientTargets.clientId, clientId)),
  ]);
  const cur = ctx.settings.currency;
  const month = todayIn(ctx.settings.timezone).slice(0, 7);
  const opts = (xs: readonly { id: string; label: string }[]) => xs.map((x) => ({ id: x.id, label: x.label }));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>KPI & conversion configuration</CardTitle>
            <CardDescription>
              Decides what counts as a result for this client. Field ids are the exact Windsor fields queried.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SettingsForm
            clientId={clientId}
            disabled={!canEdit}
            settings={ctx.settings}
            conversionFields={opts(CONVERSION_FIELDS)}
            valueFields={opts(VALUE_FIELDS)}
            kpis={opts(KPI_OPTIONS)}
            attributionWindows={opts(ATTRIBUTION_WINDOWS)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Monthly budgets</CardTitle>
            <CardDescription>Used for pacing. Saving an existing month replaces it.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <BudgetForm clientId={clientId} defaultMonth={month} disabled={!canEdit} />
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Month</TH>
                <TH className="text-right">Budget</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {budgets.map((b) => (
                <TR key={b.id}>
                  <TD>{b.month.slice(0, 7)}</TD>
                  <TD className="text-right">{formatValue("currency", b.amount, cur)}</TD>
                  <TD className="text-muted-foreground">{b.notes}</TD>
                </TR>
              ))}
              {!budgets.length && (
                <TR>
                  <TD colSpan={3} className="text-muted-foreground">
                    No budgets yet.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>KPI targets</CardTitle>
            <CardDescription>Shown on KPI cards and the agency overview.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <TargetForm clientId={clientId} kpis={opts(KPI_OPTIONS)} disabled={!canEdit} />
          <ul className="divide-y divide-border text-sm">
            {targets.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{t.metric}</span>{" "}
                  {t.metric === "CTR" || t.metric === "CVR"
                    ? `${(t.targetValue * 100).toFixed(2)}%`
                    : t.metric === "ROAS"
                      ? `${t.targetValue.toFixed(2)}x`
                      : formatValue("currency", t.targetValue, cur)}{" "}
                  <span className="text-xs text-muted-foreground">({t.direction.replace("_", " ")})</span>
                </span>
                {canEdit && (
                  <form action={deleteTarget.bind(null, clientId, t.id)}>
                    <Button variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                )}
              </li>
            ))}
            {!targets.length && <li className="py-2 text-muted-foreground">No targets yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Meta ad accounts</CardTitle>
            <CardDescription>
              Only these accounts are ever queried for this client. Ids are the numeric Meta ad account id (no act_ prefix).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Account</TH>
                <TH>Ad account id</TH>
                <TH>Connector</TH>
                <TH>Status</TH>
                {isAdmin && <TH />}
              </TR>
            </THead>
            <TBody>
              {mappings.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.displayName}</TD>
                  <TD className="font-mono text-xs">act_{m.metaAccountId}</TD>
                  <TD className="text-muted-foreground">Windsor · {m.windsorConnector}</TD>
                  <TD>
                    <Badge variant={m.isActive ? "good" : "default"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                  </TD>
                  {isAdmin && (
                    <TD className="text-right">
                      <form action={setMappingActive.bind(null, clientId, m.id, !m.isActive)}>
                        <Button variant="ghost" size="sm">
                          {m.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {isAdmin && <MappingForm clientId={clientId} />}
        </CardContent>
      </Card>
    </div>
  );
}
