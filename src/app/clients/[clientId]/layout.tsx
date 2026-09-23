import { AppHeader } from "@/components/shell/app-header";
import { ClientNav } from "@/components/shell/client-nav";
import { requireClientAccess } from "@/server/auth/access";

export default async function ClientLayout(props: LayoutProps<"/clients/[clientId]">) {
  const { clientId } = await props.params;
  const ctx = await requireClientAccess(clientId);
  return (
    <>
      <AppHeader user={ctx.user} currentClientId={ctx.client.id} />
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-6">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-xl font-semibold tracking-tight">{ctx.client.name}</h1>
            <span className="text-xs text-muted-foreground">
              {ctx.accounts.length
                ? ctx.accounts.map((a) => `${a.displayName} (act_${a.metaAccountId})`).join(" · ")
                : "No Meta ad account mapped"}
            </span>
          </div>
          <div className="mt-2">
            <ClientNav clientId={ctx.client.id} />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">{props.children}</main>
    </>
  );
}
