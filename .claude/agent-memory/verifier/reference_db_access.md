---
name: db-access-via-docker
description: How to run psql checks in this project when psql is not installed on the host
metadata:
  type: reference
---

There is no `psql` on the host. Run it inside the project's Postgres container: `docker exec harness-pg-<id> psql -U postgres -d marklist_<id> -c '...'` (find the container with `docker ps | grep <port>`). Never touch the container's `postgres` database (another project's old data). `.env`/`.env.test` reads are permission-denied; the caller passes DATABASE_URL.

Also worth probing on every API endpoint: requests sent with no or non-JSON Content-Type (plain `curl -d`). On F001 these returned 500 at first; fixed with a requireJson middleware (re-verified 2026-11-14). To confirm scrypt, recompute with node `crypto.scryptSync(pw, Buffer.from(saltHex,'hex'), 64)` against the stored hash.
