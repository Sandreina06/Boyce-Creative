import { describe, expect, it, vi } from "vitest";

// In-memory stand-in for the snapshot table.
const store = new Map<string, { queryHash: string; rows: unknown; fetchedAt: Date; expiresAt: Date }>();
vi.mock("../db", () => {
  const snapshots = { queryHash: "queryHash" };
  return {
    schema: { performanceSnapshots: snapshots },
    db: () => ({
      select: () => ({ from: () => ({ where: (cond: { v: string }) => ({ limit: async () => (store.has(cond.v) ? [store.get(cond.v)] : []) }) }) }),
      insert: () => ({
        values: (v: { queryHash: string; rows: unknown; fetchedAt: Date; expiresAt: Date }) => ({
          onConflictDoUpdate: async () => void store.set(v.queryHash, v),
        }),
      }),
    }),
  };
});
vi.mock("drizzle-orm", () => ({ eq: (_c: unknown, v: string) => ({ v }) }));

const { CachedWindsor, queryHash } = await import("./snapshots");

const req = { connector: "facebook", accounts: ["123"], fields: ["spend"], dateFrom: "2026-01-01", dateTo: "2026-01-02" };

describe("CachedWindsor stale-while-revalidate", () => {
  it("serves an expired snapshot immediately and refreshes it in the background", async () => {
    let calls = 0;
    const transport = { source: "windsor" as const, getData: async () => (calls++, [{ spend: 2 }]) };
    const hash = queryHash("windsor", req);
    const old = new Date(Date.now() - 3 * 3600_000);
    store.set(hash, { queryHash: hash, rows: [{ spend: 1 }], fetchedAt: old, expiresAt: new Date(Date.now() - 1000) });

    const c = new CachedWindsor(transport);
    const first = await c.getData(req);
    expect(first.rows).toEqual([{ spend: 1 }]); // stale, instantly
    expect(first.fetchedAt).toEqual(old); // honest "last updated"
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1); // refreshed in the background
    expect((await c.getData(req)).rows).toEqual([{ spend: 2 }]);
  });

  it("waits for Windsor only when nothing has ever been cached", async () => {
    store.clear();
    const c = new CachedWindsor({ source: "windsor" as const, getData: async () => [{ spend: 9 }] });
    expect((await c.getData(req)).rows).toEqual([{ spend: 9 }]);
  });
});
