import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["admin", "manager", "viewer"]);

export const businessType = pgEnum("business_type", [
  "lead_gen",
  "ecommerce",
  "appointment",
  "custom",
]);

export const leadMethod = pgEnum("lead_method", ["instant_form", "website", "mixed", "traffic", "other"]);

export const kpiDirection = pgEnum("kpi_direction", ["lower_better", "higher_better"]);

export const changelogCategory = pgEnum("changelog_category", [
  "budget",
  "bid_strategy",
  "budget_allocation",
  "campaign_structure",
  "audience",
  "targeting",
  "placement",
  "creative",
  "copy",
  "optimization_event",
  "tracking",
  "conversion",
  "campaign_status",
  "ad_set_status",
  "ad_status",
  "other",
]);

export const changelogSource = pgEnum("changelog_source", ["manual", "meta_activity"]);

export const insightSeverity = pgEnum("insight_severity", [
  "info",
  "opportunity",
  "warning",
  "critical",
]);

export const insightStatus = pgEnum("insight_status", [
  "new",
  "reviewed",
  "resolved",
  "dismissed",
]);

export const entityType = pgEnum("entity_type", ["account", "campaign", "adset", "ad", "creative"]);

// ---------------------------------------------------------------------------
// Agency-level configuration (single row)
// ---------------------------------------------------------------------------

export type PacingThresholds = {
  /** |variance %| at or below this is ON TRACK (e.g. 10 = ±10%). */
  onTrackPct: number;
  /** |projected variance %| above this is CRITICAL. */
  criticalPct: number;
};

export type AttentionThresholds = {
  /** Primary KPI (cost per result / ROAS) change that raises attention, in %. */
  kpiChangeWarnPct: number;
  kpiChangeCriticalPct: number;
  /** CTR drop that raises attention, in %. */
  ctrDropWarnPct: number;
  /** Minimum spend in the current period before KPI alerts are raised. */
  minSpend: number;
};

export const agencySettings = pgTable("agency_settings", {
  id: integer("id").primaryKey().default(1),
  agencyName: text("agency_name").notNull().default("Boyce Creative"),
  businessPortfolioId: text("business_portfolio_id"),
  pacingThresholds: jsonb("pacing_thresholds")
    .$type<PacingThresholds>()
    .notNull()
    .default({ onTrackPct: 10, criticalPct: 25 }),
  attentionThresholds: jsonb("attention_thresholds")
    .$type<AttentionThresholds>()
    .notNull()
    .default({ kpiChangeWarnPct: 20, kpiChangeCriticalPct: 35, ctrDropWarnPct: 20, minSpend: 50 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("manager"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) — the raw token only ever lives in the user's cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Clients & Meta account mappings
// ---------------------------------------------------------------------------

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userClientAccess = pgTable(
  "user_client_access",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientId] })],
);

export const metaAccountMappings = pgTable(
  "meta_account_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    windsorConnector: text("windsor_connector").notNull().default("facebook"),
    /** Numeric Meta ad account id exactly as Windsor returns it (no `act_` prefix). */
    metaAccountId: text("meta_account_id").notNull(),
    displayName: text("display_name").notNull(),
    currency: text("currency"),
    timezone: text("timezone"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // An ad account belongs to exactly one client.
  (t) => [uniqueIndex("meta_account_unique").on(t.windsorConnector, t.metaAccountId)],
);

export const clientSettings = pgTable("client_settings", {
  clientId: uuid("client_id")
    .primaryKey()
    .references(() => clients.id, { onDelete: "cascade" }),
  businessType: businessType("business_type").notNull().default("lead_gen"),
  /** Windsor field id counted as the client's primary result, e.g. `actions_lead`. */
  primaryConversionField: text("primary_conversion_field").notNull().default("actions_lead"),
  primaryConversionLabel: text("primary_conversion_label").notNull().default("Leads"),
  /** Windsor field id for conversion value (revenue), e.g. `action_values_purchase`. */
  primaryValueField: text("primary_value_field"),
  /** e.g. CPL, CPA, ROAS, COST_PER_RESULT */
  primaryKpi: text("primary_kpi").notNull().default("CPL"),
  secondaryKpis: text("secondary_kpis").array().notNull().default(["CTR", "CPC", "CPM", "CVR"]),
  /** Windsor `attribution_window` option; `default` = 7d_click + 1d_view. */
  attributionWindow: text("attribution_window").notNull().default("default"),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  // Business context used by recommendations
  /** Key into the benchmark library (src/server/analytics/benchmarks.ts). */
  industry: text("industry"),
  website: text("website"),
  leadMethod: leadMethod("lead_method"),
  serviceArea: text("service_area"),
  /** Free-text context: offer, seasonality, sales process, what a good lead is. */
  contextNotes: text("context_notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientBudgets = pgTable(
  "client_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** First day of the month, e.g. 2026-09-01. */
    month: date("month").notNull(),
    amount: doublePrecision("amount").notNull(),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_budget_month_unique").on(t.clientId, t.month)],
);

export const clientTargets = pgTable(
  "client_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** CPL, CPA, ROAS, CTR, … */
    metric: text("metric").notNull(),
    targetValue: doublePrecision("target_value").notNull(),
    direction: kpiDirection("direction").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_target_metric_unique").on(t.clientId, t.metric)],
);

// ---------------------------------------------------------------------------
// Changelog & annotations (Phase 3 — schema created now so migrations stay linear)
// ---------------------------------------------------------------------------

export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    metaAccountId: text("meta_account_id"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    adsetId: text("adset_id"),
    adsetName: text("adset_name"),
    adId: text("ad_id"),
    adName: text("ad_name"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    category: changelogCategory("category").notNull(),
    action: text("action").notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    hypothesis: text("hypothesis"),
    expectedImpact: text("expected_impact"),
    reviewDate: date("review_date"),
    notes: text("notes"),
    tags: text("tags").array().notNull().default([]),
    source: changelogSource("source").notNull().default("manual"),
    metaActivityRef: text("meta_activity_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("changelog_client_time_idx").on(t.clientId, t.changedAt)],
);

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    label: text("label").notNull(),
    note: text("note"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("annotations_client_date_idx").on(t.clientId, t.date)],
);

// ---------------------------------------------------------------------------
// Insights (Phase 4)
// ---------------------------------------------------------------------------

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    entityType: entityType("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    metric: text("metric").notNull(),
    rangeStart: date("range_start").notNull(),
    rangeEnd: date("range_end").notNull(),
    compareStart: date("compare_start"),
    compareEnd: date("compare_end"),
    currentValue: doublePrecision("current_value"),
    previousValue: doublePrecision("previous_value"),
    changePct: doublePrecision("change_pct"),
    severity: insightSeverity("severity").notNull(),
    status: insightStatus("status").notNull().default("new"),
    ruleId: text("rule_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** Stable hash of (client, rule, entity, metric, range) to avoid duplicates. */
    fingerprint: text("fingerprint").notNull(),
    aiSummary: text("ai_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("insight_fingerprint_unique").on(t.fingerprint),
    index("insights_client_idx").on(t.clientId, t.createdAt),
  ],
);

export const insightEvidence = pgTable("insight_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  insightId: uuid("insight_id")
    .notNull()
    .references(() => insights.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  sort: integer("sort").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Windsor response cache / snapshots
// ---------------------------------------------------------------------------

export const performanceSnapshots = pgTable(
  "performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 of the exact Windsor query (connector, accounts, fields, dates, options). */
    queryHash: text("query_hash").notNull(),
    source: text("source").notNull(),
    query: jsonb("query").notNull(),
    rows: jsonb("rows").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("snapshot_query_unique").on(t.queryHash)],
);
