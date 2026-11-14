import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Bm = { id: string; read_at: string | null };

async function save(token: string, tag: string) {
  const saved = await call("post", "/bookmarks", { token, body: { url: `https://example.com/unread-${tag}-${Date.now()}` } });
  expect(saved.status).toBe(201);
  return (saved.body as Bm).id;
}

test("DELETE /bookmarks/{id}/read on a read bookmark is 200 with read_at null", async () => {
  const { token } = await signUpFresh();
  const id = await save(token, "read");
  const marked = await call("put", "/bookmarks/{id}/read", { token, params: { id } });
  expect((marked.body as Bm).read_at).not.toBeNull();
  const res = await call("delete", "/bookmarks/{id}/read", { token, params: { id } });
  expect(res.status).toBe(200);
  expect((res.body as Bm).read_at).toBeNull();
  const get = await call("get", "/bookmarks/{id}", { token, params: { id } });
  expect((get.body as Bm).read_at).toBeNull();
});

test("DELETE on an unread bookmark is 200 with read_at null", async () => {
  const { token } = await signUpFresh();
  const id = await save(token, "unread");
  const res = await call("delete", "/bookmarks/{id}/read", { token, params: { id } });
  expect(res.status).toBe(200);
  expect((res.body as Bm).read_at).toBeNull();
});

test("another user's bookmark is 404 and stays read; no token is 401", async () => {
  const owner = await signUpFresh();
  const other = await signUpFresh();
  const id = await save(owner.token, "other");
  await call("put", "/bookmarks/{id}/read", { token: owner.token, params: { id } });
  const res = await call("delete", "/bookmarks/{id}/read", { token: other.token, params: { id } });
  expect(res.status).toBe(404);
  const anon = await call("delete", "/bookmarks/{id}/read", { params: { id } });
  expect(anon.status).toBe(401);
  const get = await call("get", "/bookmarks/{id}", { token: owner.token, params: { id } });
  expect((get.body as Bm).read_at).not.toBeNull();
});
