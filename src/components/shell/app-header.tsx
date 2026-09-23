import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { listAccessibleClients } from "@/server/auth/access";
import type { SessionUser } from "@/server/auth/session";
import { dataSource } from "@/server/services/data-meta";
import { ClientSwitcher } from "./client-switcher";
import { DateControls } from "./date-controls";

export async function AppHeader({ user, currentClientId }: { user: SessionUser; currentClientId: string | null }) {
  const clients = await listAccessibleClients(user);
  const demo = dataSource() === "demo";
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
      {demo && (
        <div className="bg-amber-100 px-4 py-1 text-center text-xs font-medium text-amber-900">
          DEMO DATA — synthetic numbers for development. Not from Meta. Set DATA_SOURCE=windsor for real data.
        </div>
      )}
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link prefetch={false} href="/agency" className="mr-2 leading-tight">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Boyce Creative</div>
          <div className="text-sm font-semibold tracking-tight">Meta Intelligence</div>
        </Link>
        <ClientSwitcher clients={clients} currentId={currentClientId} />
        <DateControls />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {user.role === "admin" && (
            <Link prefetch={false} href="/team" className="rounded px-1.5 py-1 font-medium text-primary hover:bg-muted">
              Share / Team
            </Link>
          )}
          {user.isGuest ? (
            <Link prefetch={false} href="/login" className="rounded px-1.5 py-1 hover:bg-muted hover:text-foreground">
              Admin sign in
            </Link>
          ) : (
            <>
              <span>{user.name}</span>
              <form action={logout}>
                <button className="rounded px-1.5 py-1 hover:bg-muted hover:text-foreground">Sign out</button>
              </form>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
