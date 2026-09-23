<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes (Boyce Meta Intelligence)

- Meta data comes only from Windsor via `src/server/windsor/service.ts`. It is read-only: never call Windsor write tools, and never add a direct Meta API integration.
- Pages and components must not import the Windsor transport, service or cache (ESLint enforces this). Go through `src/server/services/*`.
- Resolve account ids with `requireClientAccess()` / `loadClientContext()`. Never take them from request input.
- Only use Windsor field ids that have been verified with `get_fields` and a real `get_data` call. Add them to `src/server/windsor/fields.ts`.
- Recompute ratios from base counts. Don't average ratios.
- Run `npm run typecheck && npm run lint && npm test` before committing.
