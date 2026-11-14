# Kickoff log

## 2026-11-14: /kickoff (headless, not committed)

Ran headless with no human present. All changes are left uncommitted for the owner to review and commit with `HARNESS_HUMAN_OVERRIDE=1 git commit -m "chore: kickoff harness and scaffold"`.

### Set up
- `scripts/preset-setup.sh marklist`: package named `marklist`, pinned deps installed, `.nvmrc` = 26, `.gitignore`, local Postgres 17 in Docker (`.env.test`), `openapi.json` generated, golden principles 7 to 9 added.
- `./scripts/check.sh` passes on the empty app (lint, typecheck, jscpd, depcruise, `npm audit` high+, Semgrep, migration lint, drift, Vitest with coverage, backlog).
- Fixes needed to get there (all in `docs/decisions/0002-kickoff-preset-adjustments.md`): lint script ignores `harness/` kit files; `vitest.config.ts` no longer passes `coverage.reporter: undefined` (crashed Vitest 5); `scripts/perf.ts` handles `loadavg()[0]` possibly undefined.
- CI: `setup-uv` pinned to local uv 0.11.28; Node from `.nvmrc`.
- `test/test-size.test.ts`: fails when any single `test(...)` is over 80 lines (golden principle 6). Checked by hand: an 88-line test made it fail, removing it made it pass.
- `docs/decisions/0001-stack.md` dated. No design system / axe / visual baseline: no UI.

### Decided
- `0002`: preset adjustments above; Hono moderate advisories left at kit pins, with the rule that auth is applied per route (no wildcard `app.use` or `mount()`) until the owner bumps `hono` / `@hono/node-server`.
- `0003`: API details the spec leaves open (UUID ids, bad id is 404, error envelope for unknown routes / bad JSON / 500, email regex, title trimming, cursor format, tag order, auth-before-rate-limit, Retry-After rounding).

### Backlog
27 features: M1 16 (14 feature, 2 chore), M2 11 (9 feature, 2 chore). Priorities follow milestone then dependency order.

Analysis (step 7):
- Every spec scope item maps to a feature: conventions (F001, F005, F009, F015), auth (F001 to F004), bookmarks (F006 to F011), read status (F012 to F014), tags (F101 to F105), search (F106), rate limits (F107 to F109), Definition-of-done latency (F016, F110), contract completeness (F015, F111). Nothing out of scope has a feature.
- Fix: token-hash / scrypt storage had no observable step; F001 now checks the tables with psql.
- Fix: F005 first claimed `/openapi.json` lists routes not yet built; reduced to what exists when it runs.
- Fix: F107 depended on sign-out (F004) without need; now on sign-in (F002) for the second token.
- `validate_backlog.py` passes; no dependency points to a later priority or milestone.

### Notes for the next sessions
- `test/contract.ts` `call()` has no way to send headers yet; the first authenticated feature (F003) must add an `Authorization` option.
- Rate-limit tests (F107 to F109) use fixed one-minute windows; tests must use fresh tokens/emails so they never share counters (golden principle 7).
- `/design M1` runs before F001 and should own the shared pieces: schema (users, tokens, bookmarks), error helper, auth middleware.
