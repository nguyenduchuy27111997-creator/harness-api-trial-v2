import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Bm = { id: string; read_at: string | null };

test("PUT /bookmarks/{id}/read is 200 with read_at set to a timestamp", async () => {
  const { token } = await signUpFresh();
  const saved = await call("post", "/bookmarks", { token, body: { url: `https://example.com/read-${Date.now()}` } });
  expect(saved.status).toBe(201);
  const { id } = saved.body as Bm;
  const res = await call("put", "/bookmarks/{id}/read", { token, params: { id } });
  expect(res.status).toBe(200);
  const readAt = (res.body as Bm).read_at;
  expect(typeof readAt).toBe("string");
  expect(Number.isNaN(Date.parse(readAt!))).toBe(false);
});

test("PUT again is 200 with the same read_at", async () => {
  const { token } = await signUpFresh();
  const saved = await call("post", "/bookmarks", { token, body: { url: `https://example.com/read-twice-${Date.now()}` } });
  const { id } = saved.body as Bm;
  const first = await call("put", "/bookmarks/{id}/read", { token, params: { id } });
  const second = await call("put", "/bookmarks/{id}/read", { token, params: { id } });
  expect(second.status).toBe(200);
  expect((second.body as Bm).read_at).toBe((first.body as Bm).read_at);
});

test("another user's bookmark is 404 and stays unread; no token is 401", async () => {
  const owner = await signUpFresh();
  const other = await signUpFresh();
  const saved = await call("post", "/bookmarks", { token: owner.token, body: { url: `https://example.com/read-other-${Date.now()}` } });
  const { id } = saved.body as Bm;
  const res = await call("put", "/bookmarks/{id}/read", { token: other.token, params: { id } });
  expect(res.status).toBe(404);
  const anon = await call("put", "/bookmarks/{id}/read", { params: { id } });
  expect(anon.status).toBe(401);
  const get = await call("get", "/bookmarks/{id}", { token: owner.token, params: { id } });
  expect((get.body as Bm).read_at).toBeNull();
});
