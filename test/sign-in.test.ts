import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { signInAs, signUpAs, uniqueEmail } from "./auth-helpers.js";

afterAll(() => sql.end());

type Err = { error: { code: string; message: string } };

test("sign-in with the email in upper case returns a user and a different token", async () => {
  const email = uniqueEmail();
  const up = await signUpAs(email);
  expect(up.status).toBe(201);
  const res = await signInAs({ email: email.toUpperCase(), password: "correct-horse" });
  expect(res.status).toBe(200);
  const body = res.body as { user: { email: string }; token: string };
  expect(body.user.email).toBe(email);
  expect(body.token).toBeTruthy();
  expect(body.token).not.toBe((up.body as { token: string }).token);
});

test("a wrong password is 401 invalid_credentials", async () => {
  const email = uniqueEmail();
  await signUpAs(email);
  const res = await signInAs({ email, password: "wrong-horse-battery" });
  expect(res.status).toBe(401);
  expect((res.body as Err).error.code).toBe("invalid_credentials");
});

test("an unknown email gets the same 401 code and message as a wrong password", async () => {
  const email = uniqueEmail();
  await signUpAs(email);
  const wrong = await signInAs({ email, password: "wrong-horse-battery" });
  const unknown = await signInAs({ email: uniqueEmail(), password: "wrong-horse-battery" });
  expect(unknown.status).toBe(401);
  expect((unknown.body as Err).error).toEqual((wrong.body as Err).error);
});

test("sign-in without a password is 400 validation_error naming password", async () => {
  const res = await signInAs({ email: uniqueEmail() });
  expect(res.status).toBe(400);
  const { error } = res.body as Err;
  expect(error.code).toBe("validation_error");
  expect(error.message).toContain("password");
});
