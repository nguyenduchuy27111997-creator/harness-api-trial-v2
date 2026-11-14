<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-14T12:40:04 on a2c9c44 plus working tree
- Architect run: ac02b5a932b9dabdf
- Design sha256: c134c5a5ce02efd0e97775adec49795abaaed5ff711dd356f4e5db8d5026c18e

VERDICT: PASS
DESIGN: M2
CHECKED:
- Round-2 fix:
  - The Features line for F107 now gives F107 both branches of the `requireAuth` check: writes use `RATE_LIMIT_WRITE_PER_MIN` and GETs use `RATE_LIMIT_READ_PER_MIN`. It says only F107 and F109 edit `src/lib/auth.ts`.
  - The line for F108 says F108 only tests and verifies the GET branch and does not change `src/lib/auth.ts`. If its test finds a bug there, F108 is marked `needs_human`.
  - `src/lib/auth.ts` is in both F107's and F109's `touches`. F109 depends on F107, so those two run one after the other.
  - F108 and F109 can still run in parallel, but the only file they share is `src/lib/rate-limit.ts`, and both declare it, so the scheduler sees the overlap. The unseen edit of `src/lib/auth.ts` from round 2 cannot happen any more.
- Window-boundary rule:
  - Each burst test (F107, F108 and F109) reads the Postgres clock and waits until at least 20 s remain in the current window.
  - The new note says these tests set their own per-test timeout. Vitest's default is 5 s; the wait can reach 20 s, plus up to 60 s more for F107's "wait Retry-After" case. The verifier waits the same way or retries once.
- Coverage: F101–F111 each map to a table, a route in the Contract table or a rule, a lib function and a route file. Every acceptance case is covered, including:
  - re-adding a tag when a bookmark already has 10
  - renaming into a tag the bookmark already has, which leaves 9 tags
  - `?q=go.dev` and an empty `q`
  - reads and writes counted separately
  - `/openapi.json` and sign-up never limited
- Data model and migrations: `src/db/schema.ts` and `drizzle/0001_m2_tags_search_rate_limits.sql` match the doc.
  - `bookmarks` gains the generated `search` column, its GIN index and the `(id, user_id)` unique constraint.
  - `bookmark_tags` has its composite FK with cascade; `rate_limits` has PK `(key, window_start)`.
  - The migration only adds; Postgres fills `search` for existing rows; there is a rollback note; `_journal.json` has the new entry. No downtime and no manual step.
- Contract:
  - The order of checks (401, then 429, then 400, then 404, then `too_many_tags`) matches decision 0003.
  - `Retry-After` is at least 1.
  - Sign-in is counted after body validation and before the password check.
  - The `hit` statement is a single atomic upsert on the Postgres clock, and the doc says `$w` is an interval.
  - The shared `rateLimitedResponse` 429 entry exists in the scaffold, with a test. Each feature's job of adding it to routes is named.
- Module boundaries: the `bookmarks-not-tags` and `rate-limit-not-auth` rules in `.dependency-cruiser.cjs` match the doc. Imports go one way only (`lib/tags` → `lib/bookmarks`, `lib/auth` → `lib/rate-limit`), so there are no cycles.
- NFR:
  - The `perf` script sets both limits to 1000000.
  - `src/lib/env.ts` defaults to 60 writes and 300 reads per minute.
  - The p99 < 150 ms budget, the threat model (including the accepted sign-in lockout and the growth of `rate_limits`) and the $0 cost match the spec.
- Consistency: the choices that differ from the spec (one tags table, the check inside `requireAuth`, the env overrides, the 500-char limit on `q`, tag changes leaving `updated_at` alone) are recorded in `docs/decisions/0005-m2-design.md`. Nothing conflicts with M1 or decisions 0002 and 0003.
- Simplicity: no extra layers. The scaffold holds only what several features share.
PROBLEMS:

Notes for the caller:
- Scope of this round: I checked the round-2 problem and the new timeout note against the doc, decision 0005 and the uncommitted scaffold. Nothing else has changed since round 2, which found no other problems. I did not re-run `./scripts/check.sh` or dependency-cruiser this round.
- Not a blocker: F107 also edits `src/routes/auth.ts`, `src/routes/me.ts` and `src/routes/bookmarks.ts`, which are not in its backlog `touches`. The doc names them and asks the owner to update `touches` with `/replan`. Until that happens, the scheduler could run F107 alongside F105 or F106, which also edit `src/routes/bookmarks.ts`.

Files:
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/docs/design/M2.md
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/docs/decisions/0005-m2-design.md
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/drizzle/0001_m2_tags_search_rate_limits.sql
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/src/db/schema.ts
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/src/lib/rate-limit.ts
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/src/lib/env.ts
- /Users/huynguyen/Desktop/harness-api-trial-loop/D-M2/.dependency-cruiser.cjs
