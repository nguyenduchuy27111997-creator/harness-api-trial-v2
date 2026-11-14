import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { saveFreshBookmark, signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const PATH = "/bookmarks/{id}/tags/{tag}" as const;
const putTag = (token: string, id: string, tag: string) => call("put", PATH, { token, params: { id, tag } });
const deleteTag = (token: string | undefined, id: string, tag: string) =>
  call("delete", PATH, { token, params: { id, tag } });

test("DELETE a tag returns the bookmark with the remaining tags", async () => {
  const { token } = await signUpFresh();
  const id = await saveFreshBookmark(token);
  await putTag(token, id, "a");
  await putTag(token, id, "b");
  const res = await deleteTag(token, id, "a");
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id, tags: ["b"] });
  const get = await call("get", "/bookmarks/{id}", { token, params: { id } });
  expect((get.body as { tags: string[] }).tags).toEqual(["b"]);
});

test("DELETE the same tag again is 200 with the same tags (idempotent)", async () => {
  const { token } = await signUpFresh();
  const id = await saveFreshBookmark(token);
  await putTag(token, id, "a");
  await putTag(token, id, "b");
  await deleteTag(token, id, "a");
  const res = await deleteTag(token, id, "a");
  expect(res.status).toBe(200);
  expect((res.body as { tags: string[] }).tags).toEqual(["b"]);
});

test("another user's bookmark is 404 and its tags are untouched", async () => {
  const owner = await signUpFresh();
  const other = await signUpFresh();
  const id = await saveFreshBookmark(owner.token);
  await putTag(owner.token, id, "a");
  const res = await deleteTag(other.token, id, "a");
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ error: { code: "not_found" } });
  const get = await call("get", "/bookmarks/{id}", { token: owner.token, params: { id } });
  expect((get.body as { tags: string[] }).tags).toEqual(["a"]);
});

test("DELETE a tag without a token is 401 unauthorized", async () => {
  const { token } = await signUpFresh();
  const id = await saveFreshBookmark(token);
  await putTag(token, id, "a");
  const res = await deleteTag(undefined, id, "a");
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
