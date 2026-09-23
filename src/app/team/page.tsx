import { asc } from "drizzle-orm";
import { headers } from "next/headers";
import { setUserActive } from "@/app/actions/team";
import { AppHeader } from "@/components/shell/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/server/auth/access";
import { db, schema } from "@/server/db";
import { AddUserForm, EditAccessForm, ResetPasswordForm } from "./forms";

export default async function TeamPage() {
  const admin = await requireAdmin();
  const [users, clients, access] = await Promise.all([
    db()
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .orderBy(asc(schema.users.name)),
    db().select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name)),
    db().select().from(schema.userClientAccess),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <AppHeader user={admin} currentClientId={null} />
      <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team &amp; sharing</h1>
          <p className="text-sm text-muted-foreground">
            Share <span className="font-medium text-foreground">{origin}</span> with the people you add here. Each person signs
            in with their own email and password and only sees the clients you tick.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Add a person</CardTitle>
              <CardDescription>Send them the link, their email and the temporary password yourself.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AddUserForm clients={clients} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>People with access</CardTitle>
              <CardDescription>{users.filter((u) => u.isActive).length} active</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <ul className="divide-y divide-border">
              {users.map((u) => {
                const isSelf = u.id === admin.id;
                return (
                  <li key={u.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{u.name}</span>
                      <span className="text-sm text-muted-foreground">{u.email}</span>
                      {isSelf && <Badge variant="info">You</Badge>}
                      {!u.isActive && <Badge variant="critical">Access removed</Badge>}
                      {!isSelf && (
                        <form action={setUserActive.bind(null, u.id, !u.isActive)} className="ml-auto">
                          <Button size="sm" variant="ghost" className={u.isActive ? "text-critical" : ""}>
                            {u.isActive ? "Remove access" : "Restore access"}
                          </Button>
                        </form>
                      )}
                    </div>
                    {u.isActive && (
                      <>
                        <EditAccessForm
                          userId={u.id}
                          role={u.role}
                          clientIds={access.filter((a) => a.userId === u.id).map((a) => a.clientId)}
                          clients={clients}
                          isSelf={isSelf}
                        />
                        <ResetPasswordForm userId={u.id} />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
