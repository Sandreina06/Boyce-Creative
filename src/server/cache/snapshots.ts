import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { GetDataRequest, GetDataResponse, WindsorRow, WindsorTransport } from "../windsor/client";
import { validateGetDataRequest } from "../windsor/client";

/** Ranges that end within this many days of today are still settling in Meta (late conversions). */
const RECENT_DAYS = 2;
export const TTL_RECENT_MS = 15 * 60_000;
export const TTL_HISTORICAL_MS = 6 * 60 * 60_000;

export function queryHash(source: string, req: GetDataRequest): string {
  const canonical = JSON.stringify({
    source,
    connector: req.connector,
    accounts: [...req.accounts].sort(),
    fields: [...req.fields].sort(),
    from: req.dateFrom,
    to: req.dateTo,
    options: Object.fromEntries(Object.entries(req.options ?? {}).sort()),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function ttlFor(req: GetDataRequest, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  return req.dateTo >= cutoff ? TTL_RECENT_MS : TTL_HISTORICAL_MS;
}

const inFlight = new Map<string, Promise<GetDataResponse>>();

/**
 * Wraps a transport with a Postgres snapshot cache.
 * - Fresh snapshot → served from Postgres.
 * - Expired/missing → fetch from Windsor, store, serve.
 * - Windsor failure with a stale snapshot → serve stale (flagged) rather than nothing.
 * Demo data is never cached.
 */
export class CachedWindsor {
  constructor(private readonly transport: WindsorTransport) {}

  get source() {
    return this.transport.source;
  }

  async getData(req: GetDataRequest, opts: { forceRefresh?: boolean } = {}): Promise<GetDataResponse & { stale?: boolean }> {
    validateGetDataRequest(req);

    if (this.transport.source === "demo") {
      const rows = await this.transport.getData(req);
      return { rows, source: "demo", fetchedAt: new Date(), fromCache: false };
    }

    const hash = queryHash(this.transport.source, req);
    const existing = await db()
      .select()
      .from(schema.performanceSnapshots)
      .where(eq(schema.performanceSnapshots.queryHash, hash))
      .limit(1)
      .then((r) => r[0]);

    if (existing && !opts.forceRefresh && existing.expiresAt > new Date()) {
      return {
        rows: existing.rows as WindsorRow[],
        source: this.transport.source,
        fetchedAt: existing.fetchedAt,
        fromCache: true,
      };
    }

    // Stale-while-revalidate: an expired snapshot is served immediately (with its
    // true fetchedAt, so "Last updated" stays honest) while a refresh runs in the background.
    if (existing && !opts.forceRefresh) {
      if (!inFlight.has(hash)) void this.refresh(req, hash, existing).catch(() => undefined);
      return {
        rows: existing.rows as WindsorRow[],
        source: this.transport.source,
        fetchedAt: existing.fetchedAt,
        fromCache: true,
      };
    }

    return this.refresh(req, hash, existing);
  }

  private refresh(
    req: GetDataRequest,
    hash: string,
    existing: typeof schema.performanceSnapshots.$inferSelect | undefined,
  ): Promise<GetDataResponse & { stale?: boolean }> {
    const pending = inFlight.get(hash);
    if (pending) return pending;

    const task = (async (): Promise<GetDataResponse & { stale?: boolean }> => {
      try {
        const rows = await this.transport.getData(req);
        const fetchedAt = new Date();
        const expiresAt = new Date(fetchedAt.getTime() + ttlFor(req, fetchedAt));
        await db()
          .insert(schema.performanceSnapshots)
          .values({ queryHash: hash, source: this.transport.source, query: req, rows, fetchedAt, expiresAt })
          .onConflictDoUpdate({
            target: schema.performanceSnapshots.queryHash,
            set: { rows, fetchedAt, expiresAt, query: req },
          });
        return { rows, source: this.transport.source, fetchedAt, fromCache: false };
      } catch (err) {
        if (existing) {
          console.error("[windsor] fetch failed, serving stale snapshot:", (err as Error).message);
          return {
            rows: existing.rows as WindsorRow[],
            source: this.transport.source,
            fetchedAt: existing.fetchedAt,
            fromCache: true,
            stale: true,
          };
        }
        throw err;
      } finally {
        inFlight.delete(hash);
      }
    })();
    inFlight.set(hash, task);
    return task;
  }
}
