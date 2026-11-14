<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-14T12:28:29 on 358faa1 plus working tree
- Architect run: a42e13530eaddb2fc
- Design sha256: add20cd0335c52c81afac0a947c415e52ebf8a29a7d73c821abd0d3b7e3282a4

VERDICT: PASS
DESIGN: M1
CHECKED:
- Prior findings: (1) F016 is now fully specified. `scripts/perf.ts` signs up a fresh user, seeds 1,000 bookmarks (some read) through the API and sends that user's bearer token. `perf.config.json` gets new `auth`/`cursor` flags and four list entries, each with p99 150, which matches the spec's "under 150 ms". No unowned 50 ms targets remain. The only 50 ms budget left is the existing `/health` one. (2) `onError` (malformed JSON becomes 400 naming `body`, anything else becomes 500 `internal_error`) is now F001's job. F005 only adds `notFound`, and F001's touches include `src/app.ts` and `src/lib/errors.ts`. (3) The new `app-not-db` rule forbids `src/(app|server).ts` from importing `src/db`.
- Coverage: F001 to F016 each map to tables, contract rows and modules. Every acceptance item checked has a mechanism: email normalization, a 64-char hex token hash, dummy-hash scrypt on sign-in, per-token revocation, non-UUID ids giving 404, 409 with `existing_id`, cursor and `limit+1` paging, `coalesce` for read, status filter, and the contract-coverage test.
- Data model and migrations: `src/db/schema.ts` and `drizzle/0000_motionless_mulholland_black.sql` match the doc (uuid primary keys, cascading foreign keys, `tokens_user_id_idx`, the unique `(user_id, md5(url))` index, the `(user_id, created_at desc, id desc)` index). The migration only creates new tables, has a rollback comment, and `scripts/migration-lint.py drizzle` exits 0. There is no RLS, by a stated decision. All owner scoping lives in lib, enforced by `routes-not-db`.
- Contract: every route has its inputs, success status and errors listed. The order is 401, then 400, then 404, which is right for `@hono/zod-openapi`: route middleware runs before the validators. Error envelope, `Page<T>` and `Bookmark` (with `tags: []`) match the spec.
- Module boundaries: `.dependency-cruiser.cjs` says the same as `## Modules` (routes-not-db, app-not-db, routes-not-routes, db-only-env, lib/db-not-routes, no-circular). `npx depcruise` reports no violations. A reverse import, such as a route importing `app.ts`, is caught by no-circular.
- NFR: load, the four list budgets with their seeding mechanism, the pool size and the scrypt cost are stated. The threat model covers attackers without a token and other account holders. Cost is $0 (local only). CI runs `npm run perf` against `.env.test` after `check.sh`, so F016 needs no changes to protected files (`scripts/perf.ts` is not protected).
- Consistency: the doc departs from 0003 (microsecond cursor), the spec's unique `(user_id, url)` (md5 index) and the preset's import rule (routes may not import db). All three are recorded in `docs/decisions/0004-m1-design-refinements.md`. Per-route `requireAuth` follows 0002.
- Simplicity: one migration, no RLS, no triggers, and the shared scaffold is limited to schema and boundary rules. I found nothing speculative.
PROBLEMS:

Non-blocking notes (they do not change the verdict):
- `harness/features.json`: F003's `touches` leaves out `src/app.ts`, but F003 has to mount `routes/me.ts` there and register `bearerAuth`. The scheduler may run F003 in parallel with F005 or F006, and those touch `app.ts` too. The likely cost is a small rebase conflict. A human could add it through `/replan`.
- Cursor tamper detection: cursors are unsigned (0003). If a character is changed inside the uuid or timestamp part, the cursor can still decode to a valid shape and return 200. F009's "characters were changed" check is only reliable if the test breaks the JSON shape. Test authors should know this.
- Undefined edge cases: the doc does not say how a sign-up race on the same email (unique violation 23505) becomes 409 `email_taken`. It also does not say what happens when the existing row is deleted between `on conflict do nothing` and the `existing_id` lookup. The F001 and F007 sessions should handle both explicitly instead of letting them fall through to a 500.

Files reviewed: /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/docs/design/M1.md, /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/docs/decisions/0004-m1-design-refinements.md, /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/src/db/schema.ts, /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/drizzle/0000_motionless_mulholland_black.sql, /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/.dependency-cruiser.cjs, /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/scripts/perf.ts, /Users/huynguyen/Desktop/harness-api-trial-loop/D-M1/perf.config.json
