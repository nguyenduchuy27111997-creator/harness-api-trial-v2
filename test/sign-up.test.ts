import { createHash } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { app } from "../src/app.js";
import { call } from "./contract.js";

afterAll(() => sql.end());

// Unique per run and per lane (golden principle 7); lowercase so it equals the stored email.
let n = 0;
const unique = () => `me+${process.env.HARNESS_LANE ?? "x"}-${Date.now()}-${n++}`.toLowerCase();
const signUp = (email: string, password = "correct-horse") =>
  call("post", "/auth/sign-up", { body: { email, password } });

test("sign-up trims and lowercases the email and returns a user and token", async () => {
  const ts = unique();
  const res = await signUp(`  ${ts.replace("me", "Me")}@Example.com `);
  expect(res.status).toBe(201);
  const { user, token } = res.body as { user: Record<string, string>; token: string };
  expect(user.email).toBe(`${ts}@example.com`);
  expect(user.id).toBeTruthy();
  expect(user.created_at).toBeTruthy();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43,}$/);
  expect(JSON.stringify(res.body)).not.toContain("correct-horse");
});

test("repeating a sign-up in any letter case is 409 email_taken", async () => {
  const email = `${unique()}@example.com`;
  expect((await signUp(email)).status).toBe(201);
  const again = await signUp(email.toUpperCase());
  expect(again.status).toBe(409);
  expect(again.body).toMatchObject({ error: { code: "email_taken" } });
  expect(typeof (again.body as { error: { message: unknown } }).error.message).toBe("string");
});

test("an invalid email is 400 validation_error mentioning email", async () => {
  const res = await signUp("not-an-email");
  expect(res.status).toBe(400);
  const { error } = res.body as { error: { code: string; message: string } };
  expect(error.code).toBe("validation_error");
  expect(error.message).toContain("email");
});

test("a 7-char and a 129-char password are 400 validation_error naming password", async () => {
  for (const password of ["x".repeat(7), "x".repeat(129)]) {
    const res = await signUp(`${unique()}@example.com`, password);
    expect(res.status).toBe(400);
    const { error } = res.body as { error: { code: string; message: string } };
    expect(error.code).toBe("validation_error");
    expect(error.message).toContain("password");
  }
});

test("a body that is not valid JSON is 400 validation_error", async () => {
  const res = await app.request("/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe("validation_error");
  expect(typeof body.error.message).toBe("string");
});

test("the database holds a token hash and a password hash, never the secrets", async () => {
  const email = `${unique()}@example.com`;
  const res = await signUp(email, "correct-horse");
  const { token } = res.body as { token: string };
  const [user] = await sql<{ id: string; password_hash: string; password_salt: string }[]>`
    select id, password_hash, password_salt from users where email = ${email}`;
  expect(user).toBeDefined();
  expect(user!.password_hash).not.toContain("correct-horse");
  expect(user!.password_hash.length).toBeGreaterThan(0);
  expect(user!.password_salt.length).toBeGreaterThan(0);
  const tokens = await sql<{ token_hash: string }[]>`
    select token_hash from tokens where user_id = ${user!.id}`;
  expect(tokens).toHaveLength(1);
  expect(tokens[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(tokens[0]!.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
  expect(tokens[0]!.token_hash).not.toBe(token);
});
