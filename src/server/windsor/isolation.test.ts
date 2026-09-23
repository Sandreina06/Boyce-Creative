import { describe, expect, it, vi } from "vitest";
import { assertReadOnlyTool, validateGetDataRequest } from "./client";
import { DemoWindsorTransport } from "./demo-transport";

vi.mock("../db", () => ({ db: () => { throw new Error("db not available in tests"); }, schema: {} }));
const { normalizeRows } = await import("./service");

const req = { connector: "facebook", accounts: ["123456"], fields: ["spend"], dateFrom: "2026-09-01", dateTo: "2026-09-02" };

describe("read-only guard", () => {
  it("allows read tools and rejects every write tool", () => {
    expect(() => assertReadOnlyTool("get_data")).not.toThrow();
    for (const t of ["execute_action", "upload_files", "create_custom_field", "create_destination_task", "list_actions"]) {
      expect(() => assertReadOnlyTool(t)).toThrow(/read-only/);
    }
  });
});

describe("query validation", () => {
  it("refuses a query without explicit accounts (Windsor would return ALL accounts)", () => {
    expect(() => validateGetDataRequest({ ...req, accounts: [] })).toThrow(/explicit account/);
  });
  it("rejects non-numeric account ids and bad dates", () => {
    expect(() => validateGetDataRequest({ ...req, accounts: ["act_123"] })).toThrow();
    expect(() => validateGetDataRequest({ ...req, dateFrom: "2026-09-05" })).toThrow();
  });
});

describe("normalizeRows", () => {
  it("drops rows from accounts that are not mapped to the client", () => {
    const rows = normalizeRows(
      [
        { account_id: "111", spend: 10, actions_lead: 2 },
        { account_id: "999", spend: 99, actions_lead: 9 },
      ],
      { accountIds: ["111"], conversionFields: ["actions_lead"], valueFields: [] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountId: "111", spend: 10, actions: { actions_lead: 2 } });
  });
  it("converts Meta budgets from minor units and treats null actions as 0", () => {
    const [r] = normalizeRows(
      [{ account_id: "111", campaign_daily_budget: 3000, campaign_lifetime_budget: 0, spend: 1, actions_lead: null }],
      { accountIds: ["111"], conversionFields: ["actions_lead"], valueFields: [] },
    );
    expect(r.campaignDailyBudget).toBe(30);
    expect(r.campaignLifetimeBudget).toBeNull();
    expect(r.actions.actions_lead).toBe(0);
  });
});

describe("demo transport", () => {
  it("is deterministic and aggregates to the requested grain", async () => {
    const t = new DemoWindsorTransport();
    const q = { ...req, fields: ["account_id", "campaign_id", "spend", "impressions", "actions_lead"] };
    const a = await t.getData(q);
    const b = await t.getData(q);
    expect(a).toEqual(b);
    expect(new Set(a.map((r) => r.campaign_id)).size).toBe(a.length);
    const daily = await t.getData({ ...q, fields: ["date", "account_id", "spend"] });
    expect(daily.map((r) => r.date).sort()).toEqual(["2026-09-01", "2026-09-02"]);
  });
});
