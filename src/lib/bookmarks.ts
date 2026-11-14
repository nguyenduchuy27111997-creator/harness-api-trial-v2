import { and, asc, eq, exists, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { bookmarks, bookmarkTags } from "../db/schema.js";
import { encodeCursor, type Cursor } from "./pagination.js";

type Row = typeof bookmarks.$inferSelect;

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  note: string | null;
  read_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

const toBookmark = (b: Row): Bookmark => ({
  id: b.id,
  url: b.url,
  title: b.title,
  note: b.note,
  read_at: b.readAt?.toISOString() ?? null,
  tags: [],
  created_at: b.createdAt.toISOString(),
  updated_at: b.updatedAt.toISOString(),
});

// Fills `tags` (sorted by name) for a set of bookmarks with one query.
async function withTags(userId: string, items: Bookmark[]) {
  if (items.length === 0) return items;
  const rows = await db
    .select({ id: bookmarkTags.bookmarkId, name: bookmarkTags.name })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, items.map((b) => b.id))))
    .orderBy(asc(bookmarkTags.name));
  for (const r of rows) items.find((b) => b.id === r.id)?.tags.push(r.name);
  return items;
}

export async function getBookmarkWithTags(userId: string, id: string) {
  const b = await getBookmark(userId, id);
  return b ? (await withTags(userId, [b]))[0]! : null;
}

// url and title are expected already trimmed. Returns null when the user already saved this url.
export async function createBookmark(userId: string, input: { url: string; title?: string; note?: string | null }) {
  const [row] = await db
    .insert(bookmarks)
    .values({ userId, url: input.url, title: input.title ?? input.url, note: input.note ?? null })
    .onConflictDoNothing()
    .returning();
  return row ? toBookmark(row) : null;
}

// Id of the user's bookmark holding exactly this url (the unique index compares md5(url)).
export async function findBookmarkIdByUrl(userId: string, url: string) {
  const [row] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), sql`md5(${bookmarks.url}) = md5(${url})`, eq(bookmarks.url, url)));
  return row?.id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns null when the id is not a uuid or the bookmark is not the user's (callers answer 404 for both).
export async function getBookmark(userId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
  return row ? toBookmark(row) : null;
}

const MICROS = sql<string>`to_char(${bookmarks.createdAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

// Newest first. next_cursor is set only when more rows exist beyond this page.
export async function listBookmarks(userId: string, limit: number, cursor: Cursor | null, status?: "read" | "unread", tag?: string, q?: string) {
  const rows = await db
    .select({ row: bookmarks, micros: MICROS })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        status === "read" ? isNotNull(bookmarks.readAt) : status === "unread" ? isNull(bookmarks.readAt) : undefined,
        // No user_id here: bookmarks.user_id already scopes it and the composite FK gives a tag row its bookmark's owner. Probing bookmark_tags_pk (bookmark_id, name) per bookmark keeps the plan cheap even with stale stats (a user_id condition let the planner pick a nested loop over the user's whole tag set).
        tag
          ? exists(
              db
                .select({ one: sql`1` })
                .from(bookmarkTags)
                .where(and(eq(bookmarkTags.bookmarkId, bookmarks.id), eq(bookmarkTags.name, tag))),
            )
          : undefined,
        q ? sql`${bookmarks.search} @@ plainto_tsquery('simple', ${q})` : undefined,
        cursor ? sql`(${bookmarks.createdAt}, ${bookmarks.id}) < (${cursor.c}::timestamptz, ${cursor.i}::uuid)` : undefined,
      ),
    )
    .orderBy(sql`${bookmarks.createdAt} desc, ${bookmarks.id} desc`)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: await withTags(userId, page.map((r) => toBookmark(r.row))),
    next_cursor: rows.length > limit && last ? encodeCursor({ c: last.micros, i: last.row.id }) : null,
  };
}

// Returns null when the id is not a uuid or the bookmark is not the user's. Only title and note can change.
export async function updateBookmark(userId: string, id: string, patch: { title?: string; note?: string | null }) {
  if (!UUID.test(id)) return null;
  const set: Partial<typeof bookmarks.$inferInsert> = { updatedAt: sql`clock_timestamp()` as unknown as Date };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.note !== undefined) set.note = patch.note;
  const [row] = await db
    .update(bookmarks)
    .set(set)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .returning();
  return row ? (await withTags(userId, [toBookmark(row)]))[0]! : null;
}

// Returns false when the id is not a uuid or the bookmark is not the user's.
export async function deleteBookmark(userId: string, id: string) {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .returning({ id: bookmarks.id });
  return rows.length > 0;
}

// Sets read_at once (keeps the first time on repeats). Returns null when the id is not a uuid or the bookmark is not the user's.
export async function markBookmarkRead(userId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .update(bookmarks)
    .set({ readAt: sql`coalesce(${bookmarks.readAt}, clock_timestamp())` as unknown as Date, updatedAt: sql`clock_timestamp()` as unknown as Date })
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .returning();
  return row ? (await withTags(userId, [toBookmark(row)]))[0]! : null;
}

// Clears read_at (a no-op on an unread bookmark). Returns null when the id is not a uuid or the bookmark is not the user's.
export async function markBookmarkUnread(userId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .update(bookmarks)
    .set({ readAt: null, updatedAt: sql`clock_timestamp()` as unknown as Date })
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .returning();
  return row ? (await withTags(userId, [toBookmark(row)]))[0]! : null;
}
