import { expect, test } from "vitest";
import { app } from "../src/app.js";

test("sign-up with a body that is not sent as JSON is 400 validation_error, not 500", async () => {
  for (const [contentType, body] of [[undefined, "hello"], ["text/plain", '{"email":"a@b.co","password":"correct-horse"}']] as const) {
    const res = await app.request("/auth/sign-up", {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : {},
      body,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "validation_error" } });
  }
});
