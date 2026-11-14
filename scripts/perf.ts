// Latency budget (CI, or locally after changing a hot path): serves the API, loads each
// route in perf.config.json for a few seconds, and fails if its p99 exceeds the budget.
import { loadavg } from "node:os";
import { serve } from "@hono/node-server";
import autocannon from "autocannon";
import budgets from "../perf.config.json" with { type: "json" };
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { signUp } from "../src/lib/auth.js";
import { db, sql } from "../src/db/client.js";
import { bookmarks, users } from "../src/db/schema.js";

const server = serve({ fetch: app.fetch, port: 0 });
await new Promise((r) => server.once("listening", r));
const { port } = server.address() as { port: number };

// One user with 1,000 bookmarks (every third one read) whose token authenticates every route.
const email = `perf+${Date.now()}@example.com`;
const signedUp = await signUp(email, "perf-password");
if (!signedUp) throw new Error("perf user already exists");
const { user, token } = signedUp;
const base = Date.now() - 1_000_000;
await db.insert(bookmarks).values(
  Array.from({ length: 1000 }, (_, i) => ({
    userId: user.id,
    url: `https://example.com/perf/${i}`,
    title: `Perf bookmark ${i}`,
    readAt: i % 3 === 0 ? new Date(base + i) : null,
    createdAt: new Date(base + i * 1000),
  })),
);
const headers = { authorization: `Bearer ${token}` };
const first = await fetch(`http://127.0.0.1:${port}/bookmarks?limit=100`, { headers });
const { next_cursor } = (await first.json()) as { next_cursor: string | null };
if (!next_cursor) throw new Error("perf seed: no cursor for page 2");

// Warm-up (JIT, connection pool) so the first measured route is not penalised.
await autocannon({ headers, url: `http://127.0.0.1:${port}/bookmarks`, duration: 2, connections: 10 });

let failed = false;
const routes: { path: string; method?: string; p99: number }[] = budgets.routes;
for (const { path: template, method = "GET", p99 } of routes) {
  const path = template.replace("{cursor}", next_cursor);
  const r = await autocannon({ headers, url: `http://127.0.0.1:${port}${path}`, method: method as autocannon.Request["method"], duration: 3, connections: 10 });
  const ok = r.latency.p99 <= p99 && r.non2xx === 0 && r.errors === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${method} ${template}: p99 ${r.latency.p99} ms (budget ${p99}), ${r.requests.average} req/s, non-2xx ${r.non2xx}, load ${(loadavg()[0] ?? 0).toFixed(1)}`);
}
await db.delete(users).where(eq(users.id, user.id)); // cascades to tokens and bookmarks
await sql.end();
server.close();
process.exit(failed ? 1 : 0);
