/**
 * Idempotent seed: agency settings, the four in-scope Boyce clients and their
 * Meta ad account mappings, default KPI settings, and (optionally) the first
 * admin user from ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD.
 *
 * In scope (Boyce Creative Co. portfolio 835130686676855, confirmed 2026-09-23):
 *   Edwards Roofing, Beechwood Golf, Robertson Equipment, TW's Hardware.
 * Deliberately NOT seeded: Lane Angus (out of scope), Luna-Main-Ads and
 * Jo Martin Merchant Solutions (not in the Boyce portfolio).
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";

type SeedClient = {
  name: string;
  slug: string;
  account: { id: string; name: string };
  settings: Partial<typeof schema.clientSettings.$inferInsert>;
};

const LEAD_GEN = {
  businessType: "lead_gen" as const,
  primaryConversionField: "actions_lead",
  primaryConversionLabel: "Leads",
  primaryKpi: "CPL",
  secondaryKpis: ["CTR", "CPC", "CPM", "CVR"],
};

const CLIENTS: SeedClient[] = [
  { name: "Edwards Roofing", slug: "edwards-roofing", account: { id: "1048672036926458", name: "Edwards Roofing Ad Spend" }, settings: LEAD_GEN },
  { name: "Beechwood Golf", slug: "beechwood-golf", account: { id: "798492569058129", name: "Beechwood Ad Spend" }, settings: LEAD_GEN },
  {
    name: "Robertson Equipment",
    slug: "robertson-equipment",
    account: { id: "2151028662414054", name: "Robertson Equipment Ad Spend" },
    // Runs traffic campaigns (OUTCOME_TRAFFIC) — results = landing page views.
    settings: {
      businessType: "custom",
      primaryConversionField: "actions_landing_page_view",
      primaryConversionLabel: "Landing page views",
      primaryKpi: "COST_PER_RESULT",
      secondaryKpis: ["CTR", "CPC", "CPM"],
    },
  },
  { name: "TW's Hardware", slug: "tws-hardware", account: { id: "842145677176337", name: "TW's Hardware Ad Spend" }, settings: LEAD_GEN },
];

async function main() {
  const d = db();

  await d
    .insert(schema.agencySettings)
    .values({ id: 1, agencyName: "Boyce Creative", businessPortfolioId: "835130686676855" })
    .onConflictDoNothing();

  for (const c of CLIENTS) {
    let [client] = await d.select().from(schema.clients).where(eq(schema.clients.slug, c.slug)).limit(1);
    if (!client) {
      [client] = await d.insert(schema.clients).values({ name: c.name, slug: c.slug }).returning();
      console.log(`+ client ${c.name}`);
    }
    await d
      .insert(schema.clientSettings)
      .values({ clientId: client.id, currency: "USD", timezone: "America/New_York", ...c.settings })
      .onConflictDoNothing();
    await d
      .insert(schema.metaAccountMappings)
      .values({
        clientId: client.id,
        windsorConnector: "facebook",
        metaAccountId: c.account.id,
        displayName: c.account.name,
        currency: "USD",
        timezone: "America/New_York",
      })
      .onConflictDoNothing();
  }

  const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD && ADMIN_PASSWORD.length < 10) {
    console.warn("! ADMIN_PASSWORD must be at least 10 characters — admin user NOT created. Update the variable and redeploy.");
  } else if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const [existing] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!existing) {
      await d.insert(schema.users).values({
        email,
        name: ADMIN_NAME || email,
        role: "admin",
        passwordHash: await hashPassword(ADMIN_PASSWORD),
      });
      console.log(`+ admin user ${email}`);
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
