#!/usr/bin/env bash
# Starts the API on $PORT (the loop gives each lane its own), or the first free port from
# 3400, with the local Postgres migrated. Prints the URL it serves on.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --silent
scripts/db-up.sh
[ -f .env.test ] && set -a && . ./.env.test && set +a
[ ! -f drizzle/meta/_journal.json ] || npx drizzle-kit migrate >/dev/null  # none until the first db:generate
port="${PORT:-3400}"
if [ -z "${PORT:-}" ]; then
  while lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do port=$((port + 1)); done
fi
echo "API on http://localhost:$port (contract: http://localhost:$port/openapi.json)"
PORT="$port" exec npx tsx watch src/server.ts
