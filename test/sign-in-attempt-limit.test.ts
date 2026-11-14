import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { signInAs, signUpAs, uniqueEmail } from "./auth-helpers.js";

afterAll(() => sql.end());

type Err = { error: { code: string; message: string } };

// The window is 900 s aligned to the epoch on the Postgres clock: burst with at least 20 s left.
async function startOfWindow() {
  const rows = await sql`select extract(epoch from now())::float8 as t`;
  const t = Number(rows[0]?.t ?? 0);
  const left = 900 - (t % 900);
  if (left < 20) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
}

test("the 11th sign-in attempt for an email is 429 rate_limited with Retry-After, in any case", async () => {
  await startOfWindow();
  const email = uniqueEmail();
  const up = await signUpAs(email);
  expect(up.status).toBe(201);

  for (let i = 0; i < 10; i++) {
    const password = i % 2 === 0 ? "correct-horse" : "wrong-horse-battery";
    const res = await signInAs({ email, password });
    expect(res.status).toBe(password === "correct-horse" ? 200 : 401);
  }

  const limited = await signInAs({ email: email.toUpperCase(), password: "correct-horse" });
  expect(limited.status).toBe(429);
  expect((limited.body as Err).error.code).toBe("rate_limited");
  const retryAfter = Number(limited.headers.get("retry-after"));
  expect(Number.isInteger(retryAfter)).toBe(true);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(900);
}, 60_000);

test("another email can still sign in and sign-up is never limited", async () => {
  await startOfWindow();
  const email = uniqueEmail();
  await signUpAs(email);
  for (let i = 0; i < 11; i++) await signInAs({ email, password: "wrong-horse-battery" });
  expect((await signInAs({ email, password: "correct-horse" })).status).toBe(429);

  const other = uniqueEmail();
  expect((await signUpAs(other)).status).toBe(201);
  expect((await signInAs({ email: other, password: "correct-horse" })).status).toBe(200);

  for (let i = 0; i < 12; i++) expect((await signUpAs(uniqueEmail())).status).toBe(201);
}, 60_000);
