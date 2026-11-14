# 0003: API details the spec leaves open

- Date: 2026-11-14
- Status: accepted

## Context
`docs/product/spec.md` fixes the contract's shape but leaves some details open. /kickoff ran headless and picked the simplest option for each, so every feature session builds to the same rules. `/design M1` may refine them with a new decision.

## Decision
- **Ids.** Users, tokens and bookmarks use UUIDs (`gen_random_uuid()`). A `:id` that is not a UUID is 404 `not_found`, the same as an unknown id (never 400, never 500).
- **Timestamps.** ISO 8601 strings in UTC (`2026-11-14T10:00:00.000Z`).
- **Error envelope everywhere.** Unknown routes are 404 `not_found`; a body that is not valid JSON is 400 `validation_error` with a message naming `body`; unexpected errors are 500 `internal_error` with a generic message (no stack, no SQL, no secrets).
- **Email check.** After trimming and lowercasing, an email must match `^[^\s@]+@[^\s@]+\.[^\s@]+$` and be at most 254 chars.
- **Titles.** `title` is trimmed; an empty title (after trimming) is 400 on both `POST` and `PATCH`. An unknown field in a body is ignored.
- **Cursor.** base64url of a JSON `{ "c": created_at, "i": id }`, the last item of the page. Anything that does not decode to exactly that shape, with a valid timestamp and UUID, is 400 `invalid_cursor`. Cursors are not signed: a hand-made valid cursor only moves within the caller's own data.
- **Tags on a bookmark.** `tags` is an array of tag names sorted by name.
- **Auth before rate limit.** On protected routes the token is checked first (401 is not counted), then the per-token counter. Sign-out counts as a write. Sign-in counts every attempt for the lowercased email before checking the password; a malformed sign-in body is 400 and not counted.
- **Retry-After.** Whole seconds until the current window ends, at least 1.

## Consequences
- One shared error helper and one auth middleware (applied per route, see 0002) serve every route.
- Tests can rely on these exact codes; the verifier checks them with curl.
