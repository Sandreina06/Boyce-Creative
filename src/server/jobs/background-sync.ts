import "server-only";
import { eq } from "drizzle-orm";
import { loadClientContext } from "../auth/access";
import type { SessionUser } from "../auth/session";
import { db, schema } from "../db";
import { resolveDatesFromParams } from "../analytics/date-ranges";
import { syncMetaChanges } from "../services/changelog";
import { getClientOverview, getClientPacing } from "../services/client-data";
import { getClientIntelligence } from "../services/intelligence";

/**
 * Background refresh so nobody has to open the dashboard (or press Refresh)
 * for data to stay current. Every BACKGROUND_SYNC_MINUTES (default 15) it:
 *   - syncs each client's Meta change history into the changelog
 *   - refreshes the cached Windsor data behind Overview, Creative, Insights and pacing
 * Runs inside the web server process (Railway keeps it running).
 */

const SYSTEM_USER: SessionUser = { id: "system", email: "", name: "Background sync", role: "admin" };

let running = false;
let lastRun: { at: Date; ok: number; failed: number } | null = null;

export function backgroundSyncStatus() {
  return lastRun;
}

export async function runBackgroundSync(): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  let ok = 0;
  let failed = 0;
  try {
    const clients = await db()
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients)
      .where(eq(schema.clients.isActive, true));

    // One client at a time keeps Windsor load gentle.
    for (const c of clients) {
      try {
        const ctx = await loadClientContext(SYSTEM_USER, c.id);
        if (!ctx.accountIds.length) continue;
        const dates = resolveDatesFromParams({}, ctx.settings.timezone); // default view: last 30 days vs previous period
        await syncMetaChanges(ctx);
        await getClientPacing(ctx);
        await getClientOverview(ctx, dates);
        await getClientIntelligence(ctx, dates);
        ok++;
      } catch (err) {
        failed++;
        console.error(`[background-sync] ${c.name}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[background-sync] failed:", (err as Error).message);
  } finally {
    running = false;
    lastRun = { at: new Date(), ok, failed };
    console.log(`[background-sync] done in ${Math.round((Date.now() - started) / 1000)}s — ${ok} clients refreshed, ${failed} failed`);
  }
}

export function startBackgroundSync(): void {
  const minutes = Number(process.env.BACKGROUND_SYNC_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log("[background-sync] disabled (BACKGROUND_SYNC_MINUTES <= 0)");
    return;
  }
  // First run shortly after start-up (doesn't delay the server becoming ready), then on an interval.
  setTimeout(() => void runBackgroundSync(), 30_000).unref?.();
  setInterval(() => void runBackgroundSync(), minutes * 60_000).unref?.();
  console.log(`[background-sync] scheduled every ${minutes} min`);
}
