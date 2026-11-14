# Product spec: Marklist

A private bookmarks / reading-list HTTP API. Its clients (a browser extension and a CLI) are written later by the owner, outside this repo.

## Problem
A developer saves links from the browser and the terminal. Today they use browser bookmarks plus a notes file: nothing is searchable, and nothing is shared across devices. They want one private, searchable reading list behind an API.

## Users
One developer (the owner), through their own tools. Job: "save a link fast, find it again later, track what I have read". The API supports several accounts, but each user sees only their own data.

## Scope for this version

### Conventions (all routes)
- JSON in and out. Every error body is `{ "error": { "code": string, "message": string } }`.
- Validation errors: 400, `code: "validation_error"`, and the message names the failing field (e.g. `url`).
- Every bookmark and tag route requires `Authorization: Bearer <token>`. Missing, unknown or revoked token: 401 `unauthorized`.
- Another user's bookmark id is 404 `not_found`, never 403. Same for an id that does not exist.
- Public routes: sign-up, sign-in, `/openapi.json`. `/openapi.json` documents every route, every status and every error body.
- List endpoints return `{ "items": [...], "next_cursor": string | null }`. Empty list: `items: []`, `next_cursor: null`. `limit` defaults to 20, must be 1 to 100 (else 400). `cursor` is opaque; a malformed or tampered cursor is 400 `invalid_cursor`. Order: newest first (`created_at` desc, id as tie-breaker), so pages are stable.

### M1: auth, bookmarks, read status, pagination
- **Core flow 1, auth.**
  - `POST /auth/sign-up` `{ email, password }`: email is trimmed and lowercased and must look like an email; password 8 to 128 chars. Creates the user and returns 201 `{ user: { id, email, created_at }, token }`. Email already taken: 409 `email_taken`.
  - `POST /auth/sign-in` `{ email, password }`: returns 200 `{ user, token }` with a new token. Wrong email or wrong password: same 401 `invalid_credentials` (does not reveal which).
  - `POST /auth/sign-out`: revokes the token used for the call; 204. That token then gets 401 everywhere. Other tokens of the same user stay valid.
  - `GET /me`: 200 `{ id, email, created_at }`.
  - Token: random opaque string (at least 32 random bytes, base64url), returned once in plain text, stored only as a SHA-256 hash. Tokens do not expire; only sign-out revokes them. Passwords hashed with scrypt (`node:crypto`) and a per-user salt.
- **Core flow 2, bookmarks.**
  - `POST /bookmarks` `{ url, title?, note? }`: `url` required, absolute `http` or `https`, at most 2048 chars; `title` defaults to the url, at most 500 chars; `note` at most 10,000 chars, default null. Returns 201 with the bookmark `{ id, url, title, note, read_at, tags, created_at, updated_at }` (`tags: []` until M2 adds them).
  - Same `url` (exact string after trimming) already saved by this user: 409 `duplicate_url` with `existing_id` in the error body.
  - `GET /bookmarks?limit&cursor`: my bookmarks, newest first, paginated.
  - `GET /bookmarks/:id`: one bookmark.
  - `PATCH /bookmarks/:id` `{ title?, note? }`: update title and/or note (`note: null` clears it; empty `title` is 400). The url cannot change. Returns 200 with the bookmark.
  - `DELETE /bookmarks/:id`: 204.
- **Core flow 3, read status.**
  - `PUT /bookmarks/:id/read`: sets `read_at` to now (keeps the first timestamp if already read); 200 with the bookmark.
  - `DELETE /bookmarks/:id/read`: sets `read_at` to null; 200 with the bookmark.
  - `GET /bookmarks?status=read|unread`: filter; any other value is 400. Combinable with pagination.

### M2: tags, search, rate limits
- **Core flow 4, tags.**
  - Tag name: 1 to 32 chars, `a-z`, `0-9` and `-` only. Input is lowercased before validating. At most 10 tags per bookmark: adding an 11th is 400 `too_many_tags`.
  - `PUT /bookmarks/:id/tags/:tag`: add a tag (idempotent); 200 with the bookmark.
  - `DELETE /bookmarks/:id/tags/:tag`: remove a tag (idempotent); 200 with the bookmark.
  - `GET /tags`: my tags with counts, `{ items: [{ name, count }] }`, sorted by name, not paginated. A tag on no bookmark is not listed.
  - `PATCH /tags/:name` `{ name }`: rename. If the new name already exists, the two merge: every bookmark keeps one copy of the target tag (a merge never pushes a bookmark over 10 tags, since it replaces one tag with another). Unknown tag: 404. Returns 200 `{ name, count }`.
  - `GET /bookmarks?tag=<name>`: filter by one tag; combinable with `status` and pagination.
- **Core flow 5, search.**
  - `GET /bookmarks?q=<text>`: Postgres full-text search (`simple` config) over title, note and url. Combinable with `tag`, `status` and pagination. Results keep the list order (newest first), not rank, so cursors stay valid. Empty `q` is treated as absent.
- **Core flow 6, rate limits.**
  - Per token, fixed one-minute windows: 60 requests per minute on write routes (POST, PUT, PATCH, DELETE), 300 per minute on read routes (GET).
  - Sign-in: 10 attempts per 15 minutes per email (lowercased), counting every attempt, successful or not.
  - Over the limit: 429 `rate_limited` with a `Retry-After` header (seconds until the window resets).
  - Counters live in Postgres (no Redis). Sign-up and `/openapi.json` are not rate limited.

## Out of scope
- Fetching page content, titles or previews.
- Import / export.
- Sharing, teams, public lists.
- OAuth, email verification, password reset, token expiry or token listing.
- Any UI (the extension and CLI live elsewhere).
- Deploying anywhere: local only.

## Data
- users: id, email (unique), password hash + salt, created_at.
- tokens: id, user_id, token hash (unique), created_at, revoked_at.
- bookmarks: id, user_id, url, title, note, read_at, created_at, updated_at; unique (user_id, url).
- tags and bookmark_tags (M2), scoped to the user.
- rate-limit counters (M2): key, window start, count.
- Sensitive: passwords and tokens. Never logged, never returned; the plain token is returned only once, in the sign-up or sign-in response.

## Look and feel
None: it is an API. The contract (`/openapi.json`) is the interface.

## Stack
hono-postgres preset, as decided in `docs/decisions/0001-stack.md`: TypeScript, Hono, `@hono/zod-openapi`, Drizzle, Postgres in Docker. No Redis, no JWT library. No hosting for this version.

## Definition of done
The owner runs `./init.sh` and walks the whole contract with curl:
1. Sign up, sign in, `GET /me`.
2. Save three links; list them with `limit=2`, follow `next_cursor` to the third.
3. Mark one read; filter `status=read` and `status=unread`.
4. Tag two; filter by tag; list tags with counts.
5. Search a word that appears only in a note and get that bookmark.
6. Hit the write rate limit and see 429 with `Retry-After`.
7. Sign out; the token now gets 401.

`/openapi.json` documents every route and error. Every list endpoint (`GET /bookmarks` with and without filters and `q`, `GET /tags`) has p99 under 150 ms locally with 1,000 bookmarks.

## Choices made to fill gaps
The owner's answers left these open; the simplest option was picked:
- Sign-up also returns a token (no separate sign-in needed). Tokens never expire.
- Password 8 to 128 chars; email trimmed and lowercased.
- Field limits: url 2048, title 500, note 10,000 chars.
- Duplicate url means exact string match after trimming (no normalization).
- Read / unread via `PUT` / `DELETE /bookmarks/:id/read`; marking read twice keeps the first `read_at`.
- Search results ordered newest first, not by rank.
- Rate limits use fixed windows; GET counts as read, everything else as write; sign-in attempts count whether they succeed or not.
