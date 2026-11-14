// The data model (docs/design/<M>.md, Data model). Change it, then `npm run db:generate`
// for a new migration in drizzle/, and add a `-- rollback:` note to that migration.
import { sql } from "drizzle-orm";
import { customType, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    // FKs declared here, not with .references(() => …), so no lazy callbacks go uncovered.
    foreignKey({ name: "tokens_user_id_users_id_fk", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    index("tokens_user_id_idx").on(t.userId),
  ],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    // M2 search: kept by Postgres, never written by the app.
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('simple', title || ' ' || coalesce(note, '') || ' ' || url)`,
    ),
  },
  (t) => [
    foreignKey({ name: "bookmarks_user_id_users_id_fk", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    // md5: a 2048-char non-ASCII url can exceed the btree row limit.
    uniqueIndex("bookmarks_user_url_uq").on(t.userId, sql`md5(${t.url})`),
    index("bookmarks_user_created_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    // M2: target of bookmark_tags' composite FK, so a tag row always has its bookmark's owner.
    unique("bookmarks_id_user_uq").on(t.id, t.userId),
    index("bookmarks_search_idx").using("gin", t.search),
  ],
);

// M2 tags: a tag exists only while some bookmark carries it.
export const bookmarkTags = pgTable(
  "bookmark_tags",
  {
    bookmarkId: uuid("bookmark_id").notNull(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
  },
  (t) => [
    primaryKey({ name: "bookmark_tags_pk", columns: [t.bookmarkId, t.name] }),
    foreignKey({ name: "bookmark_tags_bookmark_user_fk", columns: [t.bookmarkId, t.userId], foreignColumns: [bookmarks.id, bookmarks.userId] }).onDelete("cascade"),
    index("bookmark_tags_user_name_idx").on(t.userId, t.name),
  ],
);

// M2 rate limits: one row per key and fixed window.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ name: "rate_limits_pk", columns: [t.key, t.windowStart] })],
);
