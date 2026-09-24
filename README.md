# Boyce Meta Intelligence

Internal, multi-client **Meta Ads** reporting and intelligence dashboard for Boyce Creative.

- Meta Ads data comes from **Windsor.ai** over its hosted MCP server (read-only). The app never
  talks to the Meta API and never holds a Meta token.
- Boyce-owned data (clients, account mappings, KPI settings, budgets, targets, changelog,
  insights, cached snapshots) lives in **PostgreSQL**.
- Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn-style UI ·
  Recharts · Drizzle ORM · Zod · Vitest. Hosting: Railway.

Design and discovery notes: [`docs/01-discovery-and-architecture.md`](docs/01-discovery-and-architecture.md).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Shell, auth, DB, clients & mappings, client switcher, date & comparison engine, Windsor service, agency overview, client overview, KPI settings, budgets & targets | ✅ Built |
| 2 | Campaign / ad set / ad pages, drilldowns, full pacing page | Next |
| 3 | Automatic changelog from Meta's change history, change impact | ✅ Built (chart annotations still to do) |
| 4 | Deterministic insights, root-cause decomposition, drilldown | |
| 5 | Creative analysis, breakdowns, saved insights, AI summaries | 🟡 Creative analysis, account health, context-aware strategy and benchmarks built; breakdowns, saved insights and AI summaries still to do |

## Intelligence (deterministic, no LLM)

- **Creative** (`/clients/[id]/creative`): each ad is labelled Winner, Scaling candidate,
  Creative fatigue, Underperformer, Stable or Low data. Fatigue needs an exposure signal
  (frequency) *and* a performance signal (CTR ↓ or cost per result ↑). The page also ranks primary
  texts and headlines, shows where clicks go (instant form vs landing pages), and lists hook/hold
  rates and Meta's relevance rankings.
- **Insights** (`/clients/[id]/insights`): account health (the drivers of KPI changes, learning
  limited, single-ad ad sets, concentration, tracking gaps, pacing, saturation) plus strategy that
  uses the client's context (industry, lead method, service area, notes in Settings) and published
  benchmarks with sources (`src/server/analytics/benchmarks.ts`).

## Automatic changelog

`/clients/[id]/changelog` is populated automatically from Meta's ad account activity log
(Windsor `activity_*` fields, one query per ad account, last 90 days, re-synced on page load
and stored in `changelog_entries` so history is kept). Noise is filtered out: billing, image-library
uploads, delivery notices, Meta's review cycles and automatic audiences. Two-step status edits are
merged into one decision ("Ad paused: Active → Paused"). Each change shows 7 days before vs 7 days
after, measured one level up for pauses and launches, with a plain-English readout that never
claims causation.

## Runs by itself

- **Background sync** (`src/server/jobs/background-sync.ts`, started from `src/instrumentation.ts`):
  every 30 minutes (`BACKGROUND_SYNC_MINUTES`) it syncs every client's Meta change history and
  refreshes the data behind Overview, Creative, Insights and pacing, even if nobody visits.
- **Stale-while-revalidate cache:** pages show the last saved data instantly and refresh it in the
  background; "Last updated" always shows the real fetch time.
- **Windsor protection:** at most 3 Windsor requests at a time (`WINDSOR_MAX_CONCURRENCY`) with
  automatic retries on rate limits and timeouts. A section that fails shows its own error card
  instead of breaking the page.

## How data flows

```
page (server component)
  → requireClientAccess(clientId)          user → authorised client → mapped account ids (Postgres)
    → services/client-data | agency         comparisons, pacing, alerts
      → windsor/service.getPerformance      builds the Windsor query (explicit account ids only)
        → cache/snapshots                   Postgres snapshot cache (15 min recent / 6 h historical)
          → McpWindsorTransport             https://mcp.windsor.ai/  — get_data only
```

Guarantees, each covered by tests or lint:

- **Client isolation** is server-side. Account ids come from `meta_account_mappings`, never from
  the request. A query with no account ids is refused (Windsor would return *all* accounts), and
  any row from an unmapped account is dropped. Unauthorised client URLs return 404.
- **Read-only Windsor.** The transport only allows `get_data`, `get_fields`, `get_options`,
  `get_connectors`. Write tools (`execute_action`, …) throw.
- **UI never calls Windsor.** ESLint blocks `src/app` and `src/components` from importing the
  Windsor transport, service or cache.
- **Ratios are recomputed from counts** at every aggregation level (CTR, CPC, CPM, CPR, CVR, ROAS).
- **No "real-time" claims.** Every page shows *Last updated X min ago* and a Refresh button.

## Local development

Requirements: Node ≥ 20.9, PostgreSQL.

```bash
cp .env.example .env.local        # set DATABASE_URL; DATA_SOURCE=demo needs no Windsor key
npm install
export $(grep -v '^#' .env.local | xargs)
npm run db:migrate
ADMIN_EMAIL=you@example.com ADMIN_NAME="You" ADMIN_PASSWORD='a-long-password' npm run db:seed
npm run dev
```

With `DATA_SOURCE=demo` every page carries a **DEMO DATA** banner and numbers are synthetic.
Set `DATA_SOURCE=windsor` and `WINDSOR_API_KEY` for real Meta data.

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

### Sharing and users

**Public read-only reporting is on by default.** Anyone with the link can view every client
dashboard without signing in. Visitors cannot change anything: settings, budgets, targets,
account mappings, the Team page and the Refresh button all require a signed-in user.
To require a login for viewing too, set `PUBLIC_DASHBOARD=false` in Railway.

Signing in uses email + password (no Google Workspace). Admins manage people at **/team**
(the "Share / Team" link in the header). Admins see every client; managers and viewers see only
the clients they are granted.

```bash
npm run user:create -- --email alex@example.com --name "Alex" --password '…' --role manager --clients edwards-roofing,tws-hardware
```

Client slugs: `edwards-roofing`, `beechwood-golf`, `robertson-equipment`, `tws-hardware`.

## Deploying to Railway

1. New project → **Deploy from GitHub repo** → this repository.
2. **+ New → Database → PostgreSQL**, then in the app service add the variable
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
3. App service variables: `DATA_SOURCE=windsor`, `WINDSOR_API_KEY=…` (from onboard.windsor.ai),
   `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`.
4. Deploy. On every start the app runs migrations, then the idempotent seed (the 4 clients and
   the admin user from `ADMIN_*`), then the server (`scripts/start.sh`). No manual step needed.

## Windsor field notes

Field ids are defined once in `src/server/windsor/fields.ts`, and every one was verified against
the live Windsor schema. Gotchas: CTR is returned as a fraction; campaign/ad set budgets are in
minor units (cents); reach and frequency are not additive; thumbnail URLs are signed and expire.
