# Preset: hono-postgres

A TypeScript HTTP API. The stack is decided (see `docs/decisions/0001-stack.md`). In `/kickoff`, this replaces steps 2 to 5:

1. Run `scripts/preset-setup.sh <app-name>`. It names the API, installs the pinned dependencies, starts a local Postgres in Docker on its own free port, writes `openapi.json`, and adds golden principles 7 to 9.
2. Run `./scripts/check.sh` and make it pass.
3. Set the date in `docs/decisions/0001-stack.md`. Record any change you make to the preset's choices as a new decision.

Then continue with `/kickoff` step 6. Skip `/kickoff` step 5b (design system): there is no UI.

## Rules that come with it
- `./init.sh` serves on `$PORT`, or on the first free port from 3400, after starting Postgres and migrating. The contract is at `/openapi.json`.
- Layout: `src/routes/` one file per resource (`createRoute` + handler), `src/db/` schema and client, `src/lib/` logic. Routes may import `lib` and `db`; `db` and `lib` never import routes (`.dependency-cruiser.cjs`).
- Every route is a `createRoute` from `@hono/zod-openapi` with zod schemas for params, query, body and each response status, including errors. After changing routes, run `npm run contract:update` and commit `openapi.json`; `scripts/drift.sh` fails when it is stale. When `openapi.json` is the only file a rebase conflicts on, the loop takes main's copy and runs that command itself (`harness/generated.json`).
- Tests live in `test/` and call the API in-process through `call()` in `test/contract.ts`, which fails on a status `openapi.json` does not document or a body that does not match its schema. Each feature gets its own test file with its own data (golden principles 6 and 7). Coverage thresholds are in `vitest.config.ts`.
- The verifier checks a feature with real HTTP calls (`curl`) against the URL `./init.sh` prints, following the contract at `/openapi.json`, and quotes the key responses as evidence; there are no screenshots.
- Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, add a `-- rollback:` comment to the new file in `drizzle/`, commit both. Never edit a migration on `main`. Destructive changes need a human decision: mark the feature `needs_human`.
- Security gates in `check.sh`: `npm audit` (high and critical, shipped dependencies), Semgrep (`scripts/sast.sh`, needs `uv`), `scripts/migration-lint.py drizzle`. Authorization lives in the routes: every route that reads or changes a user's data checks who is asking.
- Latency budget: `npm run perf` (CI) loads each route in `perf.config.json` and fails when its p99 is over budget. Add the routes you build, with budgets from the design doc's NFR.
