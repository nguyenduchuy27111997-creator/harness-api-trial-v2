import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { signInAs, signUpAs, uniqueEmail } from "./auth-helpers.js";
import { call } from "./contract.js";

afterAll(() => sql.end());

test("sign-out revokes only the token used", async () => {
  const email = uniqueEmail();
  const a = (await signUpAs(email)).body as { token: string };
  const b = (await signInAs({ email, password: "correct-horse" })).body as { token: string };
  expect(a.token).not.toBe(b.token);

  const out = await call("post", "/auth/sign-out", { token: a.token });
  expect(out.status).toBe(204);
  expect(out.body).toBe("");

  const meA = await call("get", "/me", { token: a.token });
  expect(meA.status).toBe(401);
  expect(meA.body).toMatchObject({ error: { code: "unauthorized" } });

  const again = await call("post", "/auth/sign-out", { token: a.token });
  expect(again.status).toBe(401);

  const meB = await call("get", "/me", { token: b.token });
  expect(meB.status).toBe(200);
  expect((meB.body as { email: string }).email).toBe(email);
});

test("sign-out without a token is 401 unauthorized", async () => {
  const res = await call("post", "/auth/sign-out");
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
