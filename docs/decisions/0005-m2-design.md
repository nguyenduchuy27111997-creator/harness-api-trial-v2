# 0005: M2 design choices (tags, search, rate limits)

- Date: 2026-11-14
- Status: accepted

## Context
`/design M2` (`docs/design/M2.md`) fills details the spec leaves open and differs from the spec's Data sketch in one place.

## Decision
- **Tags in one table.** `bookmark_tags (bookmark_id, user_id, name)` instead of the spec's `tags` + `bookmark_tags`. A tag exists only while a bookmark carries it, which is the rule `GET /tags` needs; no orphan cleanup. A composite FK `(bookmark_id, user_id) → bookmarks(id, user_id)` keeps tag rows on their owner's bookmarks.
- **Rate limit inside `requireAuth`.** After the token is valid, `requireAuth` counts the hit (GET as read, everything else as write). Every protected route already runs it per route (0002), so none can miss the limit.
- **Configurable per-token limits.** `RATE_LIMIT_WRITE_PER_MIN` (default 60) and `RATE_LIMIT_READ_PER_MIN` (default 300) in `lib/env`. Only `npm run perf` overrides them, so its seeding and load run. Tests and `./init.sh` use the defaults. The sign-in limit (10 per 15 minutes per email) is fixed.
- **Search query length.** `q` over 500 chars is 400 `validation_error` naming `q`.
- **Tag changes do not change `updated_at`.**

## Consequences
- Tests that need more than 60 writes per minute use several tokens or seed through `src/lib`.
- A third party can block sign-in for an email for up to 15 minutes; existing tokens keep working.
