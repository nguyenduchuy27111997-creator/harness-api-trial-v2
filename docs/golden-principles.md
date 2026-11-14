# Golden principles

Rules every change must follow. Each rule says how it is enforced. Prefer mechanical enforcement (lint, type, test) over prose. When a rule here gets a lint or test, note it.

A milestone's approved design (`docs/design/<M>.md`) takes precedence over the rules `/learn` adds below: where they conflict, follow the design, and fix the rule or the design (with a new decision and a fresh architect PASS).

1. **Validate data at boundaries.** Parse external input (HTTP, env, files, LLM output) into typed values once, at the edge. Enforced by: review.
2. **Reuse before you write.** Search for an existing helper before adding one. No near-duplicate utilities. Enforced by: review, `/garden`.
3. **Small, reversible changes.** One feature per commit. No drive-by refactors inside feature work. Enforced by: `/next` protocol.
4. **Tests prove behavior, not implementation.** Each feature has at least one test that exercises it the way a user would. Enforced by: `verifier` subagent.
5. **No secrets in code or logs.** Read secrets from env. Enforced by: gitleaks in the pre-commit hook and CI, plus review.

6. **Each feature gets its own independent e2e test; never extend another feature's test.** A test signs in, resets only the data it needs, builds its own data, and asserts one feature area. Appending steps to an existing test makes it grow past the test runner's timeout on slower CI machines. Enforced by: `reviewer` subagent, `/next` protocol, and a size check on e2e tests that `/kickoff` adds for the stack.

<!-- /learn appends new rules below. -->

7. **Tests never reset the database.** Loop lanes share one local Postgres, so a test creates the rows it needs with values unique to it (for example suffixed with `$HARNESS_LANE` and a timestamp) and leaves other rows alone. Enforced by: `reviewer` subagent.

8. **The contract is generated, committed and tested.** Every route is a `createRoute` with zod schemas for params, body and every response; `openapi.json` is regenerated (`npm run contract:update`) and committed with the change; tests call routes through `test/contract.ts`, which fails on an undocumented status or a body that does not match. Enforced by: `scripts/drift.sh` in `check.sh`, `test/contract.ts`, `reviewer` subagent.

9. **Migrations keep data.** A schema change is `npm run db:generate` plus a `-- rollback:` comment in the new migration; never edit one on `main`; expand and backfill first, drop later. Destructive changes need a human decision in `docs/decisions/`. Enforced by: `scripts/migration-lint.py` and `scripts/drift.sh` in `check.sh`, the `security-reviewer` subagent.

10. **A request succeeds whole or fails cleanly.** Two or more writes that only make sense together (a user and its first token, a row and its child rows) run in one `db.transaction`, so a failure leaves nothing half-done for a retry to trip over. Input that ends up in SQL is validated in the app as strictly as Postgres will check it (a real calendar date, a UUID, a length or range limit), so a value Postgres would reject is a 400 with the documented error code, never a 500. `Date.parse` and `new Date` accept impossible dates such as Feb 31: a timestamp is valid only if it round-trips through `toISOString()`. Unless the milestone's design says otherwise. Enforced by: `reviewer` subagent.

11. **Build the design's NFR and Shared scaffold sections to the letter, not only its data model and contract.** When `docs/design/<M>.md` names a file, config field, flag, value, query or test guard for your feature (a `perf.config.json` entry with `"auth": true` / `"cursor": true` and `limit=20`; a window guard that reads the Postgres clock with `select now()` and waits until 20 s remain), use exactly that, not a near equivalent: the reviewer checks those sections too. Before finishing, reread every line of the design that names your feature id or the file you touched. Enforced by: `reviewer` subagent.
