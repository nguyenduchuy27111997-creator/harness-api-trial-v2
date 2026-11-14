import { z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bookmarks, bookmarkTags } from "../db/schema.js";
import { getBookmarkWithTags } from "./bookmarks.js";

export const TagName = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9-]{1,32}$/));

const MAX_TAGS = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Idempotent. Returns "not_found" (bad id or not the user's), "too_many_tags", or the bookmark.
export async function addTag(userId: string, id: string, tag: string) {
  if (!UUID.test(id)) return "not_found";
  const result = await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
      .for("update");
    if (!owned) return "not_found" as const;
    const have = await tx
      .select({ name: bookmarkTags.name })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.bookmarkId, id), eq(bookmarkTags.userId, userId)));
    if (have.some((t) => t.name === tag)) return "ok" as const;
    if (have.length >= MAX_TAGS) return "too_many_tags" as const;
    await tx.insert(bookmarkTags).values({ bookmarkId: id, userId, name: tag }).onConflictDoNothing();
    return "ok" as const;
  });
  if (result !== "ok") return result;
  return (await getBookmarkWithTags(userId, id)) ?? "not_found";
}
