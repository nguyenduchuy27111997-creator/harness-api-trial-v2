---
name: db-access-via-docker
description: How to run psql checks in this project when psql is not installed on the host
metadata:
  type: reference
---

There is no `psql` on the host. Run it inside the project's Postgres container: `docker exec harness-pg-<id> psql -U postgres -d <db> -c '...'` (find the container with `docker ps | grep <port>`). The db name comes from the DATABASE_URL the caller passes: some lanes use `marklist_<id>`, but in the per-feature lane containers (e.g. harness-pg-f002) the app uses the `postgres` db itself (seen 2026-11-14). Tokens are stored as sha256 hex of the raw token (`printf %s TOKEN | shasum -a 256` to check). `.env`/`.env.test` reads are permission-denied; the caller passes DATABASE_URL.

Also worth probing on every API endpoint: requests sent with no or non-JSON Content-Type (plain `curl -d`). On F001 these returned 500 at first; fixed with a requireJson middleware (re-verified 2026-11-14). New body-taking routes keep forgetting `requireJson` in their `middleware: [...]`; F104 PATCH /tags/{name} returned 500 for a form or text/plain body (2026-11-14); fixed and re-verified the same day, though no test asserts the "content-type must be application/json" 400. Always probe this. The lane app on $PORT can die between runs: if curl gives [000], run `./init.sh` in the background (it honors $PORT). To confirm scrypt, recompute with node `crypto.scryptSync(pw, Buffer.from(saltHex,'hex'), 64)` against the stored hash.

Shell gotcha (zsh): `J='-H content-type:application/json'; curl $J` does NOT word-split, so the header gets dropped and the app returns an empty-body 400. Write the header inline or use a shell function, e.g. `p(){ curl -s -H 'Content-Type: application/json' -d "$1" $B/$2; }` (seen 2026-11-14 on F002).

Routes: sign-up is `POST /auth/sign-up` (hyphen; `/auth/signup` is 404). Cursors are unsigned base64url `{c,i}` by design (ADR 0003): a mutated cursor that still decodes to a valid timestamp+UUID returns 200, which is expected, not a bug (seen F009, 2026-11-14). Node's lenient base64url also accepts one extra trailing char.

Mark read is `PUT /bookmarks/{id}/read` (unread = DELETE); POST returns 404 route-not-found, so callers who say "POST read" mean PUT (seen F101, 2026-11-14). List the real routes with GET /openapi.json first. Lane apps may not be running: start ./init.sh in background and poll /health.

Perf budgets (`npm run perf`, F110): host load avg ~20-25 from parallel lanes makes p99 noisy, so pre-existing routes flip to FAIL between runs (this also shows the exit-1 path). Always replay the seed pattern against the live app to check each perf route returns non-empty items: on F110 the `q&tag=alpha&status=unread` route was always empty (alpha = i%3==0 = read), so its timing meant nothing (2026-11-14). The fix tags in blocks of three, which made it non-empty. To replay at 1,000 bookmarks you can't use the live app (60 writes/min). Instead, run a scratch `.mts` under `npx tsx` that imports src/app.js via absolute paths (and @hono/node-server's dist/index.mjs absolute path) with RATE_LIMIT_*=1000000. Do not use execFileSync, because it blocks the server. To test the fail path without edits, sed a scratch copy of scripts/perf.ts to point at a tight config.

Rate-limit bursts (F107-F109): read the Postgres clock with `docker exec <container> psql -U postgres -At -c "select extract(epoch from now())"` and wait until >=25 s remain in the 60 s window; a node fetch loop does 300 GETs in ~1.4 s locally, so one window is easy (seen F108, 2026-11-14).
