import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { bookmarks } from "../db/schema.js";
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

// url and title are expected already trimmed. Returns null when the user already saved this url.
export async function createBookmark(userId: string, input: { url: string; title?: string; note?: string | null }) {
  const [row] = await db
    .insert(bookmarks)
    .values({ userId, url: input.url, title: input.title ?? input.url, note: input.note ?? null })
    .onConflictDoNothing()
    .returning();
  return row ? toBookmark(row) : null;
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
export async function listBookmarks(userId: string, limit: number, cursor: Cursor | null) {
  const rows = await db
    .select({ row: bookmarks, micros: MICROS })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        cursor ? sql`(${bookmarks.createdAt}, ${bookmarks.id}) < (${cursor.c}::timestamptz, ${cursor.i}::uuid)` : undefined,
      ),
    )
    .orderBy(sql`${bookmarks.createdAt} desc, ${bookmarks.id} desc`)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => toBookmark(r.row)),
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
  return row ? toBookmark(row) : null;
}
