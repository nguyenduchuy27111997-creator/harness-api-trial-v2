#!/usr/bin/env bash
# Local Postgres for this project in Docker, on its own free port (never 5432 or another
# project's), and DATABASE_URL in .env.test. Loop lanes share it, so tests never reset
# it (golden principle 7). CI runs it too. A DATABASE_URL already set (another database) wins.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${DATABASE_URL:-}" ] && exit 0
name="harness-pg-$(basename "$PWD" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-' '-' | sed 's/-*$//')"
if ! docker ps --format '{{.Names}}' | grep -qx "$name"; then
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker start "$name" >/dev/null
  else
    port=56432
    while lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do port=$((port + 1)); done
    docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:$port:5432" postgres:17-alpine >/dev/null
  fi
fi
for _ in $(seq 60); do docker exec "$name" pg_isready -U postgres -q && break; sleep 0.5; done
port="$(docker port "$name" 5432/tcp | head -1 | sed 's/.*://')"
echo "DATABASE_URL=postgres://postgres:postgres@127.0.0.1:$port/postgres" >.env.test
