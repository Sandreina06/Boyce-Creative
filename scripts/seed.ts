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
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";

type SeedClient = {
  name: string;
  slug: string;
  account: { id: string; name: string };
  settings: Partial<typeof schema.clientSettings.$inferInsert>;
  /** Researched business context (2026-09-24) from the client's ads, targeting and public web presence. */
  context: Pick<typeof schema.clientSettings.$inferInsert, "industry" | "website" | "leadMethod" | "serviceArea" | "contextNotes">;
};

const LEAD_GEN = {
  businessType: "lead_gen" as const,
  primaryConversionField: "actions_lead",
  primaryConversionLabel: "Leads",
  primaryKpi: "CPL",
  secondaryKpis: ["CTR", "CPC", "CPM", "CVR"],
};

const CLIENTS: SeedClient[] = [
  {
    name: "Edwards Roofing",
    slug: "edwards-roofing",
    account: { id: "1048672036926458", name: "Edwards Roofing Ad Spend" },
    settings: LEAD_GEN,
    context: {
      industry: "roofing",
      website: "https://www.edwardsroofingnc.com",
      leadMethod: "instant_form",
      serviceArea: "Eastern NC & Hampton Roads, VA (HQ Murfreesboro, NC)",
      contextNotes:
        "Residential & commercial roofing, repairs, replacements and gutters. 20+ years, BBB A+ accredited, licensed and insured. Ads offer a free roof estimate/inspection with photos via Meta instant forms. A good lead is a homeowner in the service area who books an inspection; confirm lead-to-appointment rate with the client.",
    },
  },
  {
    name: "Beechwood Golf",
    slug: "beechwood-golf",
    account: { id: "798492569058129", name: "Beechwood Ad Spend" },
    settings: LEAD_GEN,
    context: {
      industry: "travel_hospitality",
      website: "https://www.beechwoodcc.com",
      leadMethod: "website",
      serviceArea: "Targets golfers around Alexandria, Richmond and Virginia Beach, VA",
      contextNotes:
        "Beechwood Country Club Stay & Play golf getaways (private rooms or whole-house rental next to the course). Leads are website pixel leads from /build-your-golf-getaway. Seasonal golf demand.",
    },
  },
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
    context: {
      industry: "equipment_dealer",
      website: "https://www.robertsonequipment.com",
      leadMethod: "traffic",
      serviceArea: "Eastern NC farmers — 50 mi around Colerain, NC",
      contextNotes:
        "NC's largest short-line equipment dealer, family owned since 1969 (Kioti, Bush Hog, Woods, Schulte, Landoll, Unverferth, J&M). Traffic campaigns to the website plus a mechanic-hiring engagement campaign.",
    },
  },
  {
    name: "TW's Hardware",
    slug: "tws-hardware",
    account: { id: "842145677176337", name: "TW's Hardware Ad Spend" },
    settings: LEAD_GEN,
    context: {
      industry: "local_retail",
      website: "https://corn.twshardware.com",
      leadMethod: "mixed",
      serviceArea: "20 mi around Sunbury, NC (27979)",
      contextNotes:
        "TW's Outdoor & Hardware. Toro zero-turn mower instant-form campaign (free Toro 60V blower offer) plus a deer-corn reservation traffic campaign (corn.twshardware.com). Seasonal, local retail.",
    },
  },
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
      .values({ clientId: client.id, currency: "USD", timezone: "America/New_York", ...c.settings, ...c.context })
      .onConflictDoNothing();
    // Fill context on existing rows only where it was never set (never overwrite edits).
    await d
      .update(schema.clientSettings)
      .set(c.context)
      .where(and(eq(schema.clientSettings.clientId, client.id), isNull(schema.clientSettings.industry)));
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
