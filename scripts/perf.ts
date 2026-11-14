// Latency budget (CI, or locally after changing a hot path): serves the API, loads each
// route in perf.config.json for a few seconds, and fails if its p99 exceeds the budget.
import { loadavg } from "node:os";
import { serve } from "@hono/node-server";
import autocannon from "autocannon";
import budgets from "../perf.config.json" with { type: "json" };
import { app } from "../src/app.js";

const server = serve({ fetch: app.fetch, port: 0 });
await new Promise((r) => server.once("listening", r));
const { port } = server.address() as { port: number };
let failed = false;
const routes: { path: string; method?: string; p99: number }[] = budgets.routes;
for (const { path, method = "GET", p99 } of routes) {
  const r = await autocannon({ url: `http://127.0.0.1:${port}${path}`, method: method as autocannon.Request["method"], duration: 3, connections: 10 });
  const ok = r.latency.p99 <= p99 && r.non2xx === 0 && r.errors === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${method} ${path}: p99 ${r.latency.p99} ms (budget ${p99}), ${r.requests.average} req/s, non-2xx ${r.non2xx}, load ${loadavg()[0].toFixed(1)}`);
}
server.close();
process.exit(failed ? 1 : 0);
