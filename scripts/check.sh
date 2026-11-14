#!/usr/bin/env bash
# The single quality gate (Hono + Postgres preset): lint, typecheck, duplication, module
# boundaries, dependency audit, static security analysis, migrations, local Postgres,
# schema drift, contract drift, API tests with coverage, backlog. The latency budget
# runs in CI (npm run perf). Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/.."

# Reinstall when the lockfile is newer than the installed tree (fresh worktrees have none).
[ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci --silent

npm run --silent lint
npm run --silent typecheck
npx jscpd --config .jscpd.json .                # duplication budget in .jscpd.json
npx depcruise --config .dependency-cruiser.cjs . # module boundaries from docs/design/<M>.md
npm audit --omit=dev --audit-level=high         # no known high or critical advisory in what ships
scripts/sast.sh                                 # Semgrep: OWASP, Node.js, secrets
python3 scripts/migration-lint.py drizzle       # new migrations keep data and say how to roll back
scripts/db-up.sh                                # local Postgres up, .env.test written
[ -f .env.test ] && set -a && . ./.env.test && set +a
[ ! -f drizzle/meta/_journal.json ] || npx drizzle-kit migrate >/dev/null  # none until the first db:generate
scripts/drift.sh                                # schema.ts has its migration; openapi.json matches the routes
npx vitest run --coverage                       # API tests through the contract; thresholds in vitest.config.ts

python3 harness/validate_backlog.py
python3 harness/quality.py || true             # the office's numbers, only in the loop ($HARNESS_QUALITY)
