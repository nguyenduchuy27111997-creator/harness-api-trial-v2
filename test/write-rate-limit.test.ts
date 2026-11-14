import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { signInAs, signUpAs, uniqueEmail } from "./auth-helpers.js";
import { call } from "./contract.js";

afterAll(() => sql.end());

type Err = { error: { code: string; message: string } };

// The window is a fixed clock minute, so start 60 writes early in a minute.
async function startOfMinute() {
  const s = new Date().getSeconds();
  if (s >= 45) await new Promise((r) => setTimeout(r, (61 - s) * 1000));
}

test("the 61st write in a minute is 429 per token; other tokens, reads and the next minute are fine", async () => {
  await startOfMinute();
  const email = uniqueEmail();
  const up = await signUpAs(email);
  const token = (up.body as { token: string }).token;
  const stamp = Date.now();

  for (let i = 0; i < 60; i++) {
    const res = await call("post", "/bookmarks", { token, body: { url: `https://example.com/rl-${stamp}-${i}` } });
    expect([201, 409]).toContain(res.status);
  }

  const limited = await call("post", "/bookmarks", { token, body: { url: `https://example.com/rl-${stamp}-61` } });
  expect(limited.status).toBe(429);
  expect((limited.body as Err).error.code).toBe("rate_limited");
  const retryAfter = Number(limited.headers.get("retry-after"));
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(60);

  const signIn = await signInAs({ email, password: "correct-horse" });
  const other = (signIn.body as { token: string }).token;
  const otherWrite = await call("post", "/bookmarks", { token: other, body: { url: `https://example.com/rl-${stamp}-other` } });
  expect(otherWrite.status).toBe(201);

  const read = await call("get", "/bookmarks", { token });
  expect(read.status).toBe(200);

  await new Promise((r) => setTimeout(r, retryAfter * 1000 + 500));
  const again = await call("post", "/bookmarks", { token, body: { url: `https://example.com/rl-${stamp}-again` } });
  expect(again.status).toBe(201);
}, 150_000);
