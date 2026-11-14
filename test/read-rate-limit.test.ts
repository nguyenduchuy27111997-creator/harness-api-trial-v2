import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { app } from "../src/app.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Err = { error: { code: string; message: string } };

// The window is a fixed 60 s epoch-aligned window on the Postgres clock (docs/design/M2.md),
// so start the 301 reads with at least 20 s left in it.
async function startOfMinute() {
  const [row] = await sql<{ epoch: string }[]>`select extract(epoch from now()) as epoch`;
  const remaining = 60 - (Number(row!.epoch) % 60);
  if (remaining < 20) await new Promise((r) => setTimeout(r, (remaining + 0.5) * 1000));
}

test("the 301st GET in a minute is 429 per token; another token and /openapi.json are not limited", async () => {
  await startOfMinute();
  const { token } = await signUpFresh();
  const other = await signUpFresh();

  for (let i = 0; i < 300; i++) {
    const res = await call("get", "/bookmarks", { token });
    expect(res.status, `GET ${i + 1}`).toBe(200);
  }

  const limited = await call("get", "/bookmarks", { token });
  expect(limited.status).toBe(429);
  expect((limited.body as Err).error.code).toBe("rate_limited");
  const retryAfter = Number(limited.headers.get("retry-after"));
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(60);

  // The contract spec is never limited, even for a limited caller.
  for (let i = 0; i < 5; i++) {
    const spec = await app.request("/openapi.json", { headers: { authorization: `Bearer ${token}` } });
    expect(spec.status).toBe(200);
  }

  // Another token has its own count.
  const otherRead = await call("get", "/bookmarks", { token: other.token });
  expect(otherRead.status).toBe(200);
}, 120_000);
