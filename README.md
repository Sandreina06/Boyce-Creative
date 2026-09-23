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
| 3 | Manual changelog, Meta-detected changes, change impact, annotations | |
| 4 | Deterministic insights, root-cause decomposition, drilldown | |
| 5 | Creative analysis, breakdowns, saved insights, AI summaries | |

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

### Users

Sign-in is email + password (no Google Workspace). Admins see every client; managers and viewers
see only the clients they are granted.

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
4. Deploy. `railway.json` runs migrations before each deploy (`node scripts/migrate.mjs`).
5. Once, from the service shell: `npm run db:seed` (creates the 4 clients and the admin user).

## Windsor field notes

Field ids are defined once in `src/server/windsor/fields.ts`, and every one was verified against
the live Windsor schema. Gotchas: CTR is returned as a fraction; campaign/ad set budgets are in
minor units (cents); reach and frequency are not additive; thumbnail URLs are signed and expire.
