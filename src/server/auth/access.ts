import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { db, schema } from "../db";
import { requireUser, type SessionUser } from "./session";

/**
 * Client isolation lives here.
 *
 *   authenticated user → authorised client → mapped Meta account ids → Windsor query
 *
 * Account ids are ALWAYS resolved from Postgres for a client the user may see.
 * They are never read from the URL, form data or the browser.
 */

export type ClientSettings = typeof schema.clientSettings.$inferSelect;

export type ClientContext = {
  user: SessionUser;
  client: { id: string; name: string; slug: string };
  settings: ClientSettings;
  accounts: { metaAccountId: string; displayName: string; currency: string | null; timezone: string | null }[];
  /** Active mapped account ids — the only accounts that may be queried for this client. */
  accountIds: string[];
};

const uuid = z.string().uuid();

/** Clients the user may access. Admins see every active client. */
export const listAccessibleClients = cache(async (user: SessionUser) => {
  const base = db()
    .select({ id: schema.clients.id, name: schema.clients.name, slug: schema.clients.slug })
    .from(schema.clients);
  if (user.role === "admin") {
    return base.where(eq(schema.clients.isActive, true)).orderBy(asc(schema.clients.name));
  }
  return base
    .innerJoin(schema.userClientAccess, eq(schema.userClientAccess.clientId, schema.clients.id))
    .where(and(eq(schema.userClientAccess.userId, user.id), eq(schema.clients.isActive, true)))
    .orderBy(asc(schema.clients.name));
});

export async function canAccessClient(user: SessionUser, clientId: string): Promise<boolean> {
  if (!uuid.safeParse(clientId).success) return false;
  const clients = await listAccessibleClients(user);
  return clients.some((c) => c.id === clientId);
}

/**
 * Resolve everything needed to query data for a client, or 404.
 * A 404 (not 403) avoids revealing which client ids exist.
 */
export const requireClientAccess = cache(async (clientId: string): Promise<ClientContext> => {
  const user = await requireUser();
  if (!(await canAccessClient(user, clientId))) notFound();
  return loadClientContext(user, clientId);
});

export async function loadClientContext(user: SessionUser, clientId: string): Promise<ClientContext> {
  const [client] = await db()
    .select({ id: schema.clients.id, name: schema.clients.name, slug: schema.clients.slug })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const [settings] = await db()
    .select()
    .from(schema.clientSettings)
    .where(eq(schema.clientSettings.clientId, clientId))
    .limit(1);
  if (!settings) throw new Error(`Client ${client.name} has no settings row`);

  const accounts = await db()
    .select({
      metaAccountId: schema.metaAccountMappings.metaAccountId,
      displayName: schema.metaAccountMappings.displayName,
      currency: schema.metaAccountMappings.currency,
      timezone: schema.metaAccountMappings.timezone,
    })
    .from(schema.metaAccountMappings)
    .where(
      and(eq(schema.metaAccountMappings.clientId, clientId), eq(schema.metaAccountMappings.isActive, true)),
    );

  return { user, client, settings, accounts, accountIds: accounts.map((a) => a.metaAccountId) };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}
