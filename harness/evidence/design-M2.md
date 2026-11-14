<!-- written by harness/hooks/verifier-evidence.py; do not edit -->
- Verified at: 2026-11-14T18:58:17 on b7c64bd plus working tree
- Architect run: a8711e77e2dd6d541
- Design sha256: c0abb66cdaea899cb1633118f1dba7451178ce98cd9e8a1050d1abf5e984c3c6

VERDICT: PASS
DESIGN: M2
CHECKED:
- Coverage: only the tag filter on `GET /bookmarks` changed (F105, F110). It is still added with `and` on top of M1's page query, and the order and cursor are unchanged. No other M2 feature is affected.
- Data model and migrations: no schema change and no new migration. src/db/schema.ts has `bookmark_tags_pk (bookmark_id, name)` on line 69, the composite FK `bookmark_tags_bookmark_user_fk (bookmark_id, user_id) -> bookmarks(id, user_id)` on line 70, and `bookmark_tags_user_name_idx` on line 71, as the doc says. The index line in the doc now says "serves `GET /tags` and rename", and the PK line now says it also serves the tag filter's per-bookmark probe (0006). The previous index problem is fixed.
- Access rules (M2.md line 32): the line now states the exception. Every `bookmark_tags` query filters `user_id = $u` except the `GET /bookmarks` tag filter, which is correlated to `b.id` under `b.user_id = $u` and relies on the composite FK. I checked this against the code:
  - every query in src/lib/tags.ts (lines 28, 31, 48, 56, 72, 79) filters by userId or inserts it;
  - the per-page tag read in src/lib/bookmarks.ts (line 36) filters by userId;
  - only the `exists` subquery in src/lib/bookmarks.ts (lines 92-96) leaves `user_id` out, and the outer query has `eq(bookmarks.userId, userId)`.
  The previous problem is fixed.
- Contract: unchanged. The Filters line (line 58) matches the code exactly, and the tag value still goes through a bound parameter.
- Module boundaries: unchanged. lib/bookmarks does not import lib/tags.
- NFR: the Security line (line 88) now says the same thing as the access rule ("filters by `user_id` or is correlated to a bookmark already scoped by `b.user_id`"), with the composite FK as the guarantee. The previous problem is fixed. Load and p99 targets are unchanged and match F110's perf entries.
- Consistency: decision 0006 records why `t.user_id` was dropped and says 0005 stands (no `tags` table). Its Consequences ("every other `bookmark_tags` query still filters by `user_id`") matches the doc and the code. No conflict with M1.md or decisions 0001-0005.
- Simplicity: the change removes a condition and adds nothing new.
PROBLEMS:

Not blocking: 0006's Decision section says only the M2.md "Filters line" was updated. The PK, index, access-rules and Security lines changed too. This is optional; it does not change the verdict.

Files: /Users/huynguyen/Desktop/harness-api-trial-loop/F110/docs/design/M2.md, /Users/huynguyen/Desktop/harness-api-trial-loop/F110/docs/decisions/0006-tag-filter-query-kept.md, /Users/huynguyen/Desktop/harness-api-trial-loop/F110/src/lib/bookmarks.ts, /Users/huynguyen/Desktop/harness-api-trial-loop/F110/src/lib/tags.ts, /Users/huynguyen/Desktop/harness-api-trial-loop/F110/src/db/schema.ts
