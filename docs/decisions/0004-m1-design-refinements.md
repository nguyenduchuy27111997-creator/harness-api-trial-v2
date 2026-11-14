# 0004: M1 design refinements to 0003 and the preset

- Date: 2026-11-14
- Status: accepted

## Context
`/design M1` (`docs/design/M1.md`) found three details where 0003 or the preset's defaults would cause wrong results or 500s.

## Decision
- **Cursor timestamp precision.** The cursor's `c` is the last item's `created_at` as a UTC ISO string with microseconds (`2026-11-14T10:00:00.123456Z`), read from Postgres, not the millisecond string the JSON shows. Rows created in the same millisecond would otherwise be skipped or repeated across pages. The rest of 0003's cursor rule (base64url JSON `{c, i}`, anything else is 400 `invalid_cursor`, unsigned) stays.
- **Duplicate-url index.** Unique on `(user_id, md5(url))` instead of `(user_id, url)`: a 2048-char multibyte url can exceed the btree row limit. Finding the existing id still compares `url` exactly.
- **Routes do not import `src/db`.** Narrower than the preset's "routes may import lib and db": every query, with its `user_id` filter, lives in `src/lib`. Enforced by dependency-cruiser rule `routes-not-db`.

## Consequences
- Cursors are a few characters longer; clients treat them as opaque anyway.
- Feature sessions must select `created_at` as text at microsecond precision for the cursor (for example `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`).
