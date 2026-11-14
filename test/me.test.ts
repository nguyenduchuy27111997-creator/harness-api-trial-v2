import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

test("GET /me with the sign-up token returns the sign-up user", async () => {
  const { user, token } = await signUpFresh();
  const res = await call("get", "/me", { token });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: user.id, email: user.email, created_at: user.created_at });
});

test("GET /me without an Authorization header is 401 unauthorized", async () => {
  const res = await call("get", "/me");
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});

test("GET /me with an unknown token is 401 unauthorized", async () => {
  const res = await call("get", "/me", { token: "not-a-real-token" });
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});

test("GET /me returns each caller's own email", async () => {
  const first = await signUpFresh();
  const second = await signUpFresh();
  const res = await call("get", "/me", { token: second.token });
  expect(res.status).toBe(200);
  expect((res.body as { email: string }).email).toBe(second.user.email);
  expect((res.body as { email: string }).email).not.toBe(first.user.email);
});
