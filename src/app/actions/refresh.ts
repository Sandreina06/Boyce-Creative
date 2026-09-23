"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { canAccessClient, listAccessibleClients, loadClientContext } from "@/server/auth/access";
import { requireUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";

/**
 * Drop cached Windsor snapshots for the given client (or every client the user
 * can access) so the next render re-queries Windsor. Authorisation is checked
 * here; the browser only ever sends a client id.
 */
export async function refreshData(clientId: string | null): Promise<void> {
  const user = await requireUser();
  let clientIds: string[];
  if (clientId) {
    if (!(await canAccessClient(user, clientId))) return;
    clientIds = [clientId];
  } else {
    clientIds = (await listAccessibleClients(user)).map((c) => c.id);
  }
  const accountIds = (await Promise.all(clientIds.map((id) => loadClientContext(user, id)))).flatMap((c) => c.accountIds);
  if (accountIds.length) {
    await db()
      .delete(schema.performanceSnapshots)
      .where(sql`${schema.performanceSnapshots.query}->'accounts' ?| ${sql.raw(`array[${accountIds.map((a) => `'${a.replace(/\D/g, "")}'`).join(",")}]`)}`);
  }
  revalidatePath(clientId ? `/clients/${clientId}` : "/agency", "layout");
}
