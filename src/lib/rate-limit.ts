import { z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/client.js";

// M2 scaffold (docs/design/M2.md): the 429 every rate-limited route documents.
export const rateLimitedResponse = {
  description: "Too many requests in the current window",
  headers: z.object({ "Retry-After": z.string().openapi({ description: "Whole seconds until the window resets, at least 1" }) }),
  content: {
    "application/json": {
      schema: z.object({ error: z.object({ code: z.literal("rate_limited"), message: z.string() }) }),
    },
  },
} as const;

// Counts one hit for `key` in the current fixed window (Postgres clock). Rejected hits count too.
// Rows of older windows for the key are deleted by the same statement.
export async function hit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.execute<{ count: number; retry_after: number }>(sql`
    with old as (delete from rate_limits where key = ${key} and window_start < date_bin(make_interval(secs => ${windowSeconds}), now(), 'epoch')),
    hit as (insert into rate_limits (key, window_start, count) values (${key}, date_bin(make_interval(secs => ${windowSeconds}), now(), 'epoch'), 1)
            on conflict (key, window_start) do update set count = rate_limits.count + 1
            returning count, window_start)
    select count, greatest(1, ceil(extract(epoch from window_start + make_interval(secs => ${windowSeconds}) - now())))::int as retry_after from hit`);
  const row = rows[0];
  if (!row) throw new Error("rate limit statement returned no row");
  return row.count > limit ? { limited: true as const, retryAfter: row.retry_after } : { limited: false as const };
}

export const rateLimited = (c: Context, retryAfter: number) => {
  c.header("Retry-After", String(retryAfter));
  return c.json({ error: { code: "rate_limited" as const, message: "Too many requests, retry later" } }, 429);
};
