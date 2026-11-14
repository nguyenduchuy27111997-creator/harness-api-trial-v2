# 0006: Tag filter probes bookmark_tags by (bookmark_id, name); no tags table

- Date: 2026-11-14
- Status: accepted

## Context
The human asked F110 to fix a slow tag filter (68 req/s, p99 243 ms on CI) with a join `bookmark_tags -> tags` on `(user_id, name)` and new indexes `tags(user_id, name)` unique, `bookmark_tags(tag_id, bookmark_id)`, `bookmarks(user_id, created_at desc, id desc)`. The schema has no `tags` table or `tag_id`: 0005 chose one `bookmark_tags` table and rejected a `tags` table with ids. `bookmarks_user_created_idx` already is `(user_id, created_at desc, id desc)`.

Reproduced with `npm run perf` (tag=alpha p99 ~95 ms at ~146 req/s, other lists 15 ms). Cause: right after a user's rows are inserted the planner has no stats for them, estimates 1 row and picks a nested loop of the user's 1,000 bookmarks against the user's ~333 `alpha` tag rows (`Rows Removed by Join Filter: 277389`, 23 ms per query). With analyzed stats the plan is a hash join and takes under 1 ms, so only fresh data (CI, perf) is hit.

## Decision
Drop `t.user_id = $u` from the `exists` in `listBookmarks`. `b.user_id = $u` scopes the query and the composite FK ties a tag row to its bookmark's owner, so nothing leaks. The remaining condition `(bookmark_id, name)` is the primary key `bookmark_tags_pk`, so each bookmark costs one index probe whatever the stats. Measured: tag=alpha p99 25-33 ms at ~775-900 req/s; EXPLAIN ANALYZE on fresh unanalyzed data 0.7 ms, using `bookmarks_user_created_idx` and `bookmark_tags_pk`. No tags table, no migration; 0005 stands. `docs/design/M2.md` updated to match (filters, access rules, indexes, security); architect PASS.

## Consequences
Every other `bookmark_tags` query still filters by `user_id`. A `tags` table needs a decision superseding 0005 and an architect PASS.
