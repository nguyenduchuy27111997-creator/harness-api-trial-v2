import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { app } from "../src/app.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Err = { error: { code: string; message: string } };

// The window is a fixed clock minute, so start the 301 reads early in a minute.
async function startOfMinute() {
  const s = new Date().getSeconds();
  if (s >= 50) await new Promise((r) => setTimeout(r, (61 - s) * 1000));
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
