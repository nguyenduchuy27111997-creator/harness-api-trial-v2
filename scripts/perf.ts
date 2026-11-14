// Latency budget (CI, or locally after changing a hot path): serves the API, loads each
// route in perf.config.json for a few seconds, and fails if its p99 exceeds the budget.
import { loadavg } from "node:os";
import { serve } from "@hono/node-server";
import autocannon from "autocannon";
import budgets from "../perf.config.json" with { type: "json" };
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db, sql } from "../src/db/client.js";
import { users } from "../src/db/schema.js";

const server = serve({ fetch: app.fetch, port: 0 });
await new Promise((r) => server.once("listening", r));
const { port } = server.address() as { port: number };

// One user with 1,000 bookmarks (every third one read), seeded through the API.
const api = `http://127.0.0.1:${port}`;
const json = { "content-type": "application/json" };
const signUpRes = await fetch(`${api}/auth/sign-up`, {
  method: "POST",
  headers: json,
  body: JSON.stringify({ email: `perf+${Date.now()}@example.com`, password: "perf-password" }),
});
if (signUpRes.status !== 201) throw new Error(`perf seed: sign-up returned ${signUpRes.status}`);
const { user, token } = (await signUpRes.json()) as { user: { id: string }; token: string };
const headers = { authorization: `Bearer ${token}` };
for (let start = 0; start < 1000; start += 50) {
  await Promise.all(
    Array.from({ length: 50 }, async (_, j) => {
      const i = start + j;
      const res = await fetch(`${api}/bookmarks`, {
        method: "POST",
        headers: { ...headers, ...json },
        body: JSON.stringify({ url: `https://example.com/perf/${i}`, title: `Perf bookmark ${i}` }),
      });
      if (res.status !== 201) throw new Error(`perf seed: POST /bookmarks returned ${res.status}`);
      if (i % 3 !== 0) return;
      const { id } = (await res.json()) as { id: string };
      const read = await fetch(`${api}/bookmarks/${id}/read`, { method: "PUT", headers });
      if (read.status !== 200) throw new Error(`perf seed: PUT read returned ${read.status}`);
    }),
  );
}

// Warm-up (JIT, connection pool) so the first measured route is not penalised.
await autocannon({ headers, url: `${api}/bookmarks`, duration: 2, connections: 10 });

let failed = false;
const routes: { path: string; method?: string; p99: number; auth?: boolean; cursor?: boolean }[] = budgets.routes;
for (const { path: configured, method = "GET", p99, auth = false, cursor = false } of routes) {
  const routeHeaders = auth ? headers : {};
  let path = configured;
  if (cursor) {
    const first = await fetch(`${api}${configured}`, { headers: routeHeaders });
    const { next_cursor } = (await first.json()) as { next_cursor: string | null };
    if (!next_cursor) throw new Error(`perf: no next_cursor for ${configured}`);
    path += `${configured.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(next_cursor)}`;
  }
  const r = await autocannon({ headers: routeHeaders, url: `${api}${path}`, method: method as autocannon.Request["method"], duration: 3, connections: 10 });
  const ok = r.latency.p99 <= p99 && r.non2xx === 0 && r.errors === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${method} ${configured}${cursor ? " (cursor page)" : ""}: p99 ${r.latency.p99} ms (budget ${p99}), ${r.requests.average} req/s, non-2xx ${r.non2xx}, load ${(loadavg()[0] ?? 0).toFixed(1)}`);
}
await db.delete(users).where(eq(users.id, user.id)); // cascades to tokens and bookmarks
await sql.end();
server.close();
process.exit(failed ? 1 : 0);
