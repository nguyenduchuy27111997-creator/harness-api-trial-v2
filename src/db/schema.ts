// The data model (docs/design/<M>.md, Data model). Change it, then `npm run db:generate`
// for a new migration in drizzle/, and add a `-- rollback:` note to that migration.
import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

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
  },
  (t) => [
    foreignKey({ name: "bookmarks_user_id_users_id_fk", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
    // md5: a 2048-char non-ASCII url can exceed the btree row limit.
    uniqueIndex("bookmarks_user_url_uq").on(t.userId, sql`md5(${t.url})`),
    index("bookmarks_user_created_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
  ],
);
