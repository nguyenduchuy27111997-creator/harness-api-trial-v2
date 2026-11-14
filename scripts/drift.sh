#!/usr/bin/env bash
# Two contracts that must match the code:
#  - src/db/schema.ts has a migration for every change (npm run db:generate);
#  - openapi.json is what the routes generate (npm run contract:update).
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=.drift  # inside the project: drizzle-kit only takes a relative --out
rm -rf "$tmp" && mkdir "$tmp"
trap 'rm -rf "$tmp"' EXIT
cp -R drizzle "$tmp/drizzle" 2>/dev/null || mkdir -p "$tmp/drizzle"
out="$(npx drizzle-kit generate --dialect postgresql --schema ./src/db/schema.ts --out "./$tmp/drizzle" 2>&1)" || { echo "$out" >&2; exit 1; }
if ! grep -q "No schema changes" <<<"$out"; then
  echo "drift: src/db/schema.ts changed without a migration: run npm run db:generate and commit drizzle/" >&2
  exit 1
fi
npx tsx scripts/openapi.ts >"$tmp/openapi.json"
if ! diff -q openapi.json "$tmp/openapi.json" >/dev/null; then
  { diff -u openapi.json "$tmp/openapi.json" || true; } | head -40 >&2
  echo "drift: openapi.json does not match the routes: run npm run contract:update and commit it" >&2
  exit 1
fi
