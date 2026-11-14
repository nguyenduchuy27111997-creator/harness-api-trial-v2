-- rollback: drop table "bookmark_tags"; drop table "rate_limits"; drop index "bookmarks_search_idx"; alter table "bookmarks" drop constraint "bookmarks_id_user_uq", drop column "search";
CREATE TABLE "bookmark_tags" (
	"bookmark_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "bookmark_tags_pk" PRIMARY KEY("bookmark_id","name")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || coalesce(note, '') || ' ' || url)) STORED;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_id_user_uq" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "bookmark_tags" ADD CONSTRAINT "bookmark_tags_bookmark_user_fk" FOREIGN KEY ("bookmark_id","user_id") REFERENCES "public"."bookmarks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmark_tags_user_name_idx" ON "bookmark_tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "bookmarks_search_idx" ON "bookmarks" USING gin ("search");