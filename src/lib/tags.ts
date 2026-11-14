import { z } from "@hono/zod-openapi";
import { and, asc, count, eq, sql } from "drizzle-orm";
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

// Idempotent. Returns "not_found" (bad id or not the user's), or the bookmark.
export async function removeTag(userId: string, id: string, tag: string) {
  if (!UUID.test(id)) return "not_found";
  const [owned] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
  if (!owned) return "not_found";
  await db
    .delete(bookmarkTags)
    .where(and(eq(bookmarkTags.bookmarkId, id), eq(bookmarkTags.userId, userId), eq(bookmarkTags.name, tag)));
  return (await getBookmarkWithTags(userId, id)) ?? "not_found";
}

export async function listTags(userId: string) {
  return db
    .select({ name: bookmarkTags.name, count: count() })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.userId, userId))
    .groupBy(bookmarkTags.name)
    .orderBy(asc(bookmarkTags.name));
}

// Merges into `to` if the user already has it. Returns "not_found" (no bookmark of the user carries `from`) or the new tag with its count.
export async function renameTag(userId: string, from: string, to: string) {
  from = from.toLowerCase();
  return db.transaction(async (tx) => {
    if (from !== to) {
      await tx.execute(sql`
        insert into bookmark_tags (bookmark_id, user_id, name)
        select bookmark_id, user_id, ${to} from bookmark_tags where user_id = ${userId} and name = ${from}
        on conflict do nothing`);
      const deleted = await tx
        .delete(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.name, from)))
        .returning({ id: bookmarkTags.bookmarkId });
      if (deleted.length === 0) return "not_found" as const;
    }
    const [{ count: n } = { count: 0 }] = await tx
      .select({ count: count() })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.name, to)));
    if (from === to && n === 0) return "not_found" as const;
    return { name: to, count: n };
  });
}
