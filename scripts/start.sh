#!/bin/sh
# Production entrypoint (Railway): create/upgrade tables, seed, then serve.
# Migrations must succeed; a seed problem is logged but never blocks the app.
set -e
node scripts/migrate.mjs
npx tsx scripts/seed.ts || echo "! Seed failed — the dashboard will still start. See the error above."
exec npx next start -p "${PORT:-3000}"
