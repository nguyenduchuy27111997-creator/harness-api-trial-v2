#!/usr/bin/env bash
# One-time setup for the Hono + Postgres preset, run by /kickoff (or /adopt). Safe to
# re-run: every step skips what is already there.
#
# Usage: scripts/preset-setup.sh [app-name]     (default: the folder name)
set -euo pipefail
cd "$(dirname "$0")/.."
name="$(printf '%s' "${1:-$(basename "$PWD")}" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' | sed 's/^-*//; s/-*$//')"

# 1. Name the API (package, health route, contract title, its test).
for f in package.json src/routes/health.ts src/app.ts test/health.test.ts; do
  sed -i.bak "s/__APP_NAME__/$name/g" "$f" && rm "$f.bak"
done

# 2. Pinned dependencies (package.json, versions the kit last tested with).
npm install --silent
node -p 'process.versions.node.split(".")[0]' >.nvmrc

# 3. Ignore generated files.
touch .gitignore
for line in node_modules/ coverage/ .env.test .playwright-mcp/ .drift/; do
  grep -qxF "$line" .gitignore || printf '%s\n' "$line" >>.gitignore
done

# 4. Local Postgres on its own port, and the contract from the routes.
scripts/db-up.sh
mkdir -p drizzle
npm run --silent contract:update

# 5. The preset's golden principles.
if ! grep -q "Tests never reset the database" docs/golden-principles.md; then
  cat >>docs/golden-principles.md <<'RULES'

7. **Tests never reset the database.** Loop lanes share one local Postgres, so a test creates the rows it needs with values unique to it (for example suffixed with `$HARNESS_LANE` and a timestamp) and leaves other rows alone. Enforced by: `reviewer` subagent.

8. **The contract is generated, committed and tested.** Every route is a `createRoute` with zod schemas for params, body and every response; `openapi.json` is regenerated (`npm run contract:update`) and committed with the change; tests call routes through `test/contract.ts`, which fails on an undocumented status or a body that does not match. Enforced by: `scripts/drift.sh` in `check.sh`, `test/contract.ts`, `reviewer` subagent.

9. **Migrations keep data.** A schema change is `npm run db:generate` plus a `-- rollback:` comment in the new migration; never edit one on `main`; expand and backfill first, drop later. Destructive changes need a human decision in `docs/decisions/`. Enforced by: `scripts/migration-lint.py` and `scripts/drift.sh` in `check.sh`, the `security-reviewer` subagent.
RULES
fi

echo "Preset ready for $name. Next: scripts/check.sh"
