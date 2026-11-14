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
