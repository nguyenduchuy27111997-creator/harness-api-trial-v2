import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bookmarks } from "../db/schema.js";

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
