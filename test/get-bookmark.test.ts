import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const notFound = { error: { code: "not_found" } };

test("GET /bookmarks/{id} returns the saved bookmark", async () => {
  const { token } = await signUpFresh();
  const url = `https://example.com/get-${Date.now()}`;
  const saved = await call("post", "/bookmarks", { token, body: { url, title: "T", note: "n" } });
  expect(saved.status).toBe(201);
  const { id } = saved.body as { id: string };
  const res = await call("get", "/bookmarks/{id}", { token, params: { id } });
  expect(res.status).toBe(200);
  expect(res.body).toEqual(saved.body);
});

test("another user's bookmark is 404 not_found, not 403", async () => {
  const first = await signUpFresh();
  const second = await signUpFresh();
  const saved = await call("post", "/bookmarks", {
    token: first.token, body: { url: `https://example.com/private-${Date.now()}` },
  });
  const { id } = saved.body as { id: string };
  const res = await call("get", "/bookmarks/{id}", { token: second.token, params: { id } });
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject(notFound);
});

test.each([
  ["a random uuid", () => randomUUID()],
  ["a non-uuid", () => "not-a-uuid"],
])("GET /bookmarks/{id} with %s is 404 not_found", async (_n, makeId) => {
  const { token } = await signUpFresh();
  const res = await call("get", "/bookmarks/{id}", { token, params: { id: makeId() } });
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject(notFound);
});

test("GET /bookmarks/{id} without a token is 401 unauthorized", async () => {
  const { token } = await signUpFresh();
  const saved = await call("post", "/bookmarks", {
    token, body: { url: `https://example.com/anon-${Date.now()}` },
  });
  const { id } = saved.body as { id: string };
  const res = await call("get", "/bookmarks/{id}", { params: { id } });
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
