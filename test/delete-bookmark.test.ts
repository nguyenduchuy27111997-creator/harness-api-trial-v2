import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

async function save(token: string, tag: string) {
  const url = `https://example.com/delete-${tag}-${Date.now()}`;
  const res = await call("post", "/bookmarks", { token, body: { url } });
  expect(res.status).toBe(201);
  return { url, id: (res.body as { id: string }).id };
}

test("DELETE /bookmarks/{id} is 204, then GET is 404", async () => {
  const { token } = await signUpFresh();
  const { id } = await save(token, "basic");
  const del = await call("delete", "/bookmarks/{id}", { token, params: { id } });
  expect(del.status).toBe(204);
  const get = await call("get", "/bookmarks/{id}", { token, params: { id } });
  expect(get.status).toBe(404);
});

test("deleting the same id again is 404 not_found", async () => {
  const { token } = await signUpFresh();
  const { id } = await save(token, "twice");
  expect((await call("delete", "/bookmarks/{id}", { token, params: { id } })).status).toBe(204);
  const again = await call("delete", "/bookmarks/{id}", { token, params: { id } });
  expect(again.status).toBe(404);
  expect(again.body).toMatchObject({ error: { code: "not_found" } });
});

test("another user's bookmark is 404 and still exists for its owner", async () => {
  const owner = await signUpFresh();
  const other = await signUpFresh();
  const { id } = await save(owner.token, "other");
  const del = await call("delete", "/bookmarks/{id}", { token: other.token, params: { id } });
  expect(del.status).toBe(404);
  expect(del.body).toMatchObject({ error: { code: "not_found" } });
  const get = await call("get", "/bookmarks/{id}", { token: owner.token, params: { id } });
  expect(get.status).toBe(200);
});

test("the url can be saved again after deletion", async () => {
  const { token } = await signUpFresh();
  const { id, url } = await save(token, "resave");
  expect((await call("delete", "/bookmarks/{id}", { token, params: { id } })).status).toBe(204);
  const again = await call("post", "/bookmarks", { token, body: { url } });
  expect(again.status).toBe(201);
});
