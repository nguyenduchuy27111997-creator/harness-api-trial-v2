import { expect, test } from "vitest";
import { app } from "../src/app.js";

// Unknown routes are not in openapi.json, so call() cannot be used; hit the app directly.
const expectNotFound = async (res: Response) => {
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toContain("json");
  const body = await res.json();
  expect(body).toEqual({ error: { code: "not_found", message: expect.any(String) } });
};

test("GET on an unknown route is 404 not_found in the error envelope", async () => {
  await expectNotFound(await app.request("/no-such-route"));
});

test("POST with a JSON body to an unknown route is 404 not_found in the same shape", async () => {
  await expectNotFound(
    await app.request("/no-such-route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    }),
  );
});

test("GET /openapi.json is 200 without a token", async () => {
  const res = await app.request("/openapi.json");
  expect(res.status).toBe(200);
  expect(await res.json()).toHaveProperty("paths");
});
