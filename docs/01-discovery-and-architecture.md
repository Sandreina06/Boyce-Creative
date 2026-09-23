# Boyce Meta Intelligence — Discovery & Architecture Proposal

Status: **Proposal — awaiting approval before Phase 1 build**
Date: 2026-09-23
Scope: Meta Ads only, read-only, data via Windsor.ai.

---

## 1. Repository

The repository (`Boyce-Creative`) is empty: no commits, no existing code, no
conventions to preserve. Phase 1 starts from a clean Next.js scaffold.

---

## 2. Windsor.ai MCP — what is actually available

All findings below come from live calls to the Windsor MCP (`get_connectors`,
`get_fields`, `get_options`, `get_data`). Nothing here is assumed.

### 2.1 Tools

| Tool | Use in V1 |
|---|---|
| `get_connectors` | ✅ Discover connected Meta ad accounts (id + name) |
| `get_fields` / `get_options` | ✅ Schema discovery, connector options |
| `get_data` | ✅ **The only data tool we need** |
| `get_custom_fields` | ✅ Read-only, optional |
| `list_actions`, `execute_action`, `upload_files` | ❌ **Blocked** — write tools (pause/enable/create/budget changes on Meta) |
| `create_custom_field`, `create_destination_task` | ❌ **Blocked** — create state in the Windsor account |

The app's Windsor client will enforce an **allowlist** (`get_data`,
`get_fields`, `get_options`, `get_connectors`). Any other tool name throws.

### 2.2 Account

- Windsor user: `sonia4900gmailcom`, plan: **Trial** (⚠ see Risks).
- Connector id for Meta: **`facebook`**. (A `google_ads` connector is also
  connected — ignored; the app is Meta-only.)
- Connected Meta ad accounts (6):

| Windsor account id | Name | Currency | Timezone |
|---|---|---|---|
| `2151028662414054` | Robertson Equipment Ad Spend | USD | America/New_York |
| `462883958825975`  | Luna-Main-Ads | GBP | Europe/London |
| `798492569058129`  | Beechwood Ad Spend | USD | America/New_York |
| `514719903399419`  | Jo Martin Merchant Solutions | GBP | UTC |
| `842145677176337`  | TW's Hardware Ad Spend | USD | America/New_York |
| `1048672036926458` | Edwards Roofing Ad Spend | USD | America/New_York |

### 2.3 Identifiers

- **Account IDs are numeric strings without the `act_` prefix**
  (e.g. `1048672036926458`). `MetaAccountMapping` stores the bare numeric ID
  as the canonical key; the UI may display it as `act_…`.
- `get_data(accounts=[...])` restricts the query server-side to those
  accounts → this is the client-isolation mechanism.
- Hierarchy IDs: `campaign_id`, `adset_id`, `ad_id`, `creative_id` (all
  numeric strings). Names: `campaign`, `adset_name`, `ad_name`.
  (Aliases `campaignid`, `adgroupid`, `adid` also exist — we will not use them.)
- The business portfolio ID you gave (`835130686676855`) is **not exposed** as
  an account-level field in Windsor (only `custom_conversion_business_id`
  exists). We store it on the Boyce side as agency config; it is not used for
  querying.

### 2.4 Grain / aggregation behaviour (verified)

Windsor aggregates to whatever dimensions are requested:

- `account_id` + metrics → one row per account
- `campaign_id` + metrics → one row per campaign
- `date` + `ad_id` + metrics → one row per ad per day

So each hierarchy page is a single `get_data` call. Rows with zero delivery
are omitted unless the `include_objects_without_insights` option is set.

### 2.5 Core metrics (verified present)

| Concept | Windsor field | Notes |
|---|---|---|
| Spend | `spend` | Major currency units (e.g. `910.54`) |
| Impressions | `impressions` | |
| Reach | `reach` | Non-additive across days/entities — must be queried at the target grain, never summed |
| Frequency | `frequency` | Non-additive — same |
| Clicks (all) | `clicks` | |
| Link clicks | `actions_link_click` / `link_clicks` | |
| CTR | `ctr` | **Returned as a fraction** (`0.025` = 2.5%) |
| CPC / CPM | `cpc`, `cpm` | |
| Outbound clicks | `outbound_clicks_outbound_click` | |
| Landing page views | `actions_landing_page_view` | |
| Quality/engagement/conversion ranking | `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` | Ad-level only |
| Video | `video_p25…p100_watched_actions_video_view`, `video_thruplay_watched_actions_video_view`, `video_avg_time_watched_actions_video_view` | Hook/hold analysis for creative |

**Rule:** the app will **recompute** CTR, CPC, CPM, CPA, CVR, ROAS, frequency
ratios from base counts when aggregating (sums of ratios are wrong). Windsor's
pre-computed ratios are only used at their native grain.

### 2.6 Conversions / results (verified present)

Four families exist, each with count, value and cost-per variants:

| Family | Example | Seen with data |
|---|---|---|
| `actions_*` | `actions_lead`, `actions_purchase`, `actions_complete_registration`, `actions_onsite_conversion_lead_grouped` (instant forms), `actions_offsite_conversion_fb_pixel_lead` (pixel), `actions_onsite_conversion_messaging_conversation_started_7d` | ✅ |
| `action_values_*` | `action_values_purchase`, `action_values_omni_purchase` | ✅ |
| `conversions_*` (standard events) | `conversions_schedule_total`, `conversions_submit_application_total`, `conversions_contact_total`, `conversions_start_trial_total` | fields exist |
| Custom conversions | `custom_conversion_action_name` / `_count` / `_value`, plus account-specific fields such as `actions_tally_form_submit`, `actions_estimate_booking` | fields exist |

ROAS fields: `purchase_roas_omni_purchase`,
`website_purchase_roas_offsite_conversion_fb_pixel_purchase` — but we will
compute ROAS as `value / spend` for consistency with the chosen conversion.

**Real-world example of why KPI config matters:**
Beechwood's leads arrive via the pixel (`actions_offsite_conversion_fb_pixel_lead`),
while Edwards Roofing / TW's Hardware use instant forms
(`actions_onsite_conversion_lead_grouped`). `actions_lead` is the combined
total. Luna has 0 leads but 17 `actions_complete_registration`.
→ **Primary Conversion is a per-client setting that stores the exact Windsor
field id**, chosen from a validated list (not free text).

### 2.7 Attribution

Connector option `attribution_window`: `default` (= 7d_click + 1d_view),
`1d_click`, `7d_click`, `28d_click`, `1d_view`, `7d_view`, `28d_view`, `dda`,
`incrementality`, first/all-conversion variants, SKAN.
Option `use_unified_attribution_setting` = use each ad set's own setting.
→ Stored per client in `ClientSettings.attributionWindow`, passed on every query,
and displayed in the UI next to results.

### 2.8 Breakdowns

Available: `age`, `gender`, `country`, `region`, `publisher_platform`,
`platform_position`, `impression_device`, `device_platform`,
`hourly_stats_aggregated_by_*`.
**Verified constraint:** Meta rejects some combinations when action fields are
requested (e.g. `age + gender + publisher_platform` + `actions_*` → error #100).
The service will query one breakdown family at a time (age+gender, placement,
geography, device) and surface Windsor errors cleanly.

### 2.9 Date filtering

`date_from` / `date_to` (ISO dates) and `date_preset` (`last_Xd`, `this_month`,
`last_year`, `T` suffix = include today). The app will **always send explicit
`date_from`/`date_to`** computed by our comparison engine in the client's
timezone, so current vs comparison ranges are exact and reproducible.

### 2.10 Entity metadata (for pages)

- Campaign: `campaign_objective`, `campaign_effective_status`,
  `campaign_configured_status`, `campaign_daily_budget`,
  `campaign_lifetime_budget`, `campaign_bid_strategy`, `campaign_spend_cap`.
- Ad set: `adset_effective_status`, `adset_daily_budget`,
  `adset_lifetime_budget`, `adsset_optimization_goal` (sic — Windsor's
  spelling), `adset_bid_strategy`, `adset_learning_stage_info`,
  **`adset_targeting`** (full JSON: ages, geo, interests, Advantage+ audience).
- Ad / creative: `effective_status`, `creative_id`, `thumbnail_url`,
  `image_url`, `body`, `title`, `call_to_action_type`, `link_url`,
  `ad_preview_shareable_link`, `ad_created_time`.
- ⚠ **Budgets are returned in minor units** (`campaign_daily_budget: 3000` =
  $30.00/day) while `spend` is in major units. The service normalises.
- ⚠ `thumbnail_url` values are signed Meta CDN URLs that expire — never store
  them long-term; refetch.

### 2.11 Bonus: Meta change history (Activities)

Windsor exposes the Meta account **activity log**: `activity_event_time`,
`activity_actor_name`, `activity_event_type` (e.g. `update_ad_run_status`,
`create_ad`, budget/bid updates), `activity_object_type/id/name`,
`activity_extra_data` (JSON with `old_value`/`new_value`). Verified with real
data (80 events in 30 days for Edwards Roofing, including status changes made by
Sonia).

This is directly useful for question 5 ("What was changed recently?"):
- the **manual Boyce changelog** stays the primary, owned record (reason,
  hypothesis, expected impact, review date), and
- the Meta activity log is shown alongside it as **"Detected in Meta"**
  events, with a one-click "Document this change" that pre-fills a manual entry.

### 2.12a Confirmed Boyce portfolio (business 835130686676855)

The Boyce Creative Co. business portfolio contains 5 ad accounts; **4 are in scope**
(confirmed by the user, 2026-09-23). Seed mapping, one client per account:

| Client | Meta account id | In Windsor? |
|---|---|---|
| Edwards Roofing | `1048672036926458` | ✅ |
| Beechwood Golf | `798492569058129` | ✅ |
| Robertson Equipment | `2151028662414054` | ✅ |
| TW's Hardware | `842145677176337` | ✅ |

Excluded (connected in Windsor but **not** in the Boyce portfolio — must never
be seeded or queried): `462883958825975` Luna-Main-Ads,
`514719903399419` Jo Martin Merchant Solutions.

Lane Angus (`1496773465190264`) is in the portfolio but **out of scope** per
the user — not seeded, not queried (it is also not connected in Windsor).

### 2.12 Not available / limitations

- No per-account `business_id` field.
- No native "results" field matching Ads Manager's "Results" column per
  objective → we use the client's configured conversion field.
- `reach`/`frequency` cannot be summed across days — trend charts show daily
  reach; period totals need their own query.
- Windsor `data_fetched_at` is returned — we use it for "Last updated".

---

## 3. Key architectural decision: how the deployed app reaches Windsor

The Windsor MCP in this Claude Code session is authenticated as *my* connector;
the app running on Railway cannot use it. The deployed server needs its own
credential. It is **not** a Meta token — it's a **Windsor API key**.

**Recommendation:** a `WindsorClient` interface with a single implementation
behind it, chosen by env var:

1. **`McpWindsorTransport`** (default, per your brief): the Next.js server
   connects to Windsor's hosted MCP endpoint using the official
   `@modelcontextprotocol/sdk` client over Streamable HTTP, authenticated with
   `WINDSOR_API_KEY`, and calls only allowlisted tools.
2. **`FixtureWindsorTransport`**: reads recorded JSON fixtures (captured from
   the real queries above, clearly labelled **DEMO DATA**) for local dev,
   tests and screenshots without network.

A REST adapter (Windsor's `connectors.windsor.ai/facebook` API) could slot in
behind the same interface later if MCP latency is a problem — not built in V1.

---

## 4. Data flow & isolation

```
Browser
  → Next.js Server Component / Route Handler
    → requireClientAccess(user, clientId)          # 403 if no UserClientAccess
      → accountIds = MetaAccountMapping[clientId]   # from Postgres only
        → PerformanceService (comparison, metrics, insights)
          → WindsorService.getCampaignPerformance({accountIds, range, conversion, attribution})
            → WindsorClient.getData(connector='facebook', accounts=accountIds, …)
```

- `accountIds` **never** come from the request. The URL carries `clientId`
  only; the server resolves accounts from the DB after an authorization check.
- `WindsorService` asserts `accountIds.length > 0` — an empty list would mean
  "all accounts" to Windsor, so it is rejected, not passed through.
- Every response row is additionally validated (`account_id ∈ accountIds`)
  as defence-in-depth.
- Components never import Windsor code (enforced by an ESLint
  `no-restricted-imports` rule on `server/windsor/**`).

---

## 5. Proposed database schema (Drizzle ORM + Postgres)

Drizzle recommended over Prisma: SQL-first, no binary engine on Railway, types
flow into Zod easily.

```
agency_settings      id, business_portfolio_id, pacing thresholds (jsonb), insight thresholds (jsonb)
users                id, email, name, role ('admin'|'manager'|'viewer'), created_at
user_client_access   user_id, client_id, role                       PK(user_id, client_id)
clients              id (uuid), name, slug, status, created_at
meta_account_mappings id, client_id, windsor_connector ('facebook'), meta_account_id (numeric string, UNIQUE),
                     display_name, currency, timezone, is_active
client_settings      client_id PK, business_type ('lead_gen'|'ecommerce'|'appointment'|'custom'),
                     primary_conversion_field (windsor field id), primary_conversion_label ('Leads'),
                     primary_value_field (nullable), primary_kpi ('CPL'|'CPA'|'ROAS'|…),
                     secondary_kpis (text[]), attribution_window, currency, timezone
client_budgets       id, client_id, month (date, 1st), amount, notes          UNIQUE(client_id, month)
client_targets       id, client_id, metric, target_value, direction ('lower_better'|'higher_better'),
                     effective_from, effective_to
changelog_entries    id, client_id, meta_account_id, campaign_id/name, adset_id/name, ad_id/name,
                     changed_at (timestamptz), author_id, category (enum 16), action,
                     previous_value, new_value, reason, hypothesis, expected_impact,
                     review_date, notes, tags text[], source ('manual'|'meta_activity'),
                     meta_activity_ref, created_at, updated_at
annotations          id, client_id, date, label, note, author_id
insights             id, client_id, entity_type, entity_id, entity_name, metric,
                     range_start, range_end, compare_start, compare_end,
                     current_value, previous_value, change_pct, severity (enum), status (enum),
                     rule_id, title, description, fingerprint (dedupe), ai_summary, created_at, updated_at
insight_evidence     id, insight_id, kind ('driver'|'concentration'|'drilldown'|'series'), payload jsonb, sort
performance_snapshots id, client_id, query_hash, grain, range_start, range_end, payload jsonb,
                     windsor_fetched_at, created_at, expires_at                 INDEX(query_hash)
```

Auth: Auth.js (NextAuth v5) with Google Workspace SSO restricted to Boyce's
domain (or email magic link) — **needs your choice** (see §9).

---

## 6. Application architecture

```
src/
  app/
    (auth)/login
    agency/page.tsx
    clients/[clientId]/{overview,campaigns,adsets,ads,creative,pacing,insights,changelog,settings}/page.tsx
    api/…                      # route handlers for mutations (changelog, settings, insight status)
  server/
    auth/                      # session, requireClientAccess()
    db/                        # drizzle schema, migrations, queries
    windsor/
      client.ts                # WindsorClient interface + tool allowlist
      mcp-transport.ts
      fixture-transport.ts
      fields.ts                # the verified field ids above, as typed constants
      service.ts               # getAccountPerformance, getCampaignPerformance, getAdSetPerformance,
                               # getAdPerformance, getCreativePerformance, getPerformanceTrend,
                               # getBreakdownPerformance, getMetaActivity
    analytics/
      date-ranges.ts           # presets + comparison engine (tz-aware)
      metrics.ts               # derived metrics from base counts
      compare.ts               # current vs previous, abs/pct deltas, direction-aware good/bad
      pacing.ts                # budget pacing, thresholds from agency_settings
      decomposition.ts         # CPL = CPM / (1000·CTR·CVR) driver decomposition
      drilldown.ts             # account → campaign → ad set → ad contribution analysis
      rules/                   # deterministic insight rules (Phase 4)
    cache/snapshots.ts
  components/                  # shadcn/ui + Recharts; no server imports
```

### Root-cause maths (Phase 4 preview)
Cost per result decomposes exactly:
`CPR = CPM / 1000 ÷ (CTR × CVR)` → `ln(CPR) = ln(CPM) − ln(CTR) − ln(CVR) + c`.
Log-change of CPR equals the sum of the three log-changes, so each driver's
share of the movement is computed exactly (no causal claim — "mathematically
associated with"). Drilldown uses contribution-to-change
(`Δ spend_share × CPR + share × ΔCPR`) per child entity.

### Cache
Snapshots keyed by hash(client, accounts, fields, range, attribution). TTL:
15 min for ranges including today, 6 h for fully historical ranges. UI always
shows "Last updated X min ago" from `windsor_fetched_at` with a manual refresh.
Never labelled "real-time".

---

## 7. Page hierarchy

```
/login
/agency                       Needs Attention · client health table
/clients/[id]/overview        KPI cards (per ClientSettings) · trend · campaigns · pacing · insights · changes
/clients/[id]/campaigns       table → /campaigns/[campaignId]
/clients/[id]/adsets          table → /adsets/[adsetId]
/clients/[id]/ads             table → /ads/[adId]
/clients/[id]/creative        winners / fatigue / underperformers / scaling candidates
/clients/[id]/pacing
/clients/[id]/insights        → /insights/[insightId] (evidence & drilldown)
/clients/[id]/changelog       timeline, + Add Change, Meta-detected activity
/clients/[id]/settings        account mappings, KPIs, budgets, targets
```

Global header: client switcher (persists via URL + cookie), date preset,
compare mode, "Last updated". Date/compare state lives in URL search params so
links are shareable.

---

## 8. Phases

| Phase | Scope |
|---|---|
| **1** | Next.js/TS/Tailwind/shadcn scaffold · Drizzle + Railway Postgres · auth · clients, mappings, settings, budgets · client switcher · date & comparison engine · Windsor client (MCP + fixtures) · agency overview (spend/results/CPR/pacing basics) · client overview KPI cards + trend |
| **2** | Campaign / ad set / ad tables (sort, filter, search, compare) · entity drilldown pages · budget pacing page |
| **3** | Manual changelog + timeline · Meta activity feed · change impact (N days before/after) · chart annotations |
| **4** | Deterministic insight rules · driver decomposition · drilldown attribution · Needs Attention · agency health |
| **5** | Creative analysis (multi-signal fatigue) · breakdowns · saved insights · Claude summaries from structured evidence only |

Each phase ends with a commit/push to `claude/boyce-meta-intelligence-f8rpn1`,
typecheck, lint, and unit tests for the analytics maths.

---

## 9. Decisions needed from you

1. **Windsor runtime credential** — OK to use a `WINDSOR_API_KEY` env var on
   Railway, connecting to Windsor's hosted MCP (recommended), with fixtures for
   local/demo?
2. **Auth** — Google Workspace SSO restricted to the Boyce domain
   (recommended; which domain?) or email magic links?
3. ~~Client → account mapping seed~~ — **confirmed** (see §2.12a).
4. **Drizzle** vs Prisma — recommending Drizzle.

## 10. Risks

- **Windsor Trial plan**: data access may stop when the trial ends; the app
  must fail gracefully and fall back to cached snapshots with a clear banner.
- Windsor MCP latency for ad-level daily queries on large accounts — mitigated
  by snapshot cache and narrow field lists.
- Meta breakdown-combination errors — handled per breakdown family.
