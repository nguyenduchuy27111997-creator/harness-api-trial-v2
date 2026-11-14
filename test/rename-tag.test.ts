import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { saveFreshBookmark, signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const putTag = (token: string, id: string, tag: string) =>
  call("put", "/bookmarks/{id}/tags/{tag}", { token, params: { id, tag } });
const rename = (token: string | undefined, name: string, to: unknown) =>
  call("patch", "/tags/{name}", { token, params: { name }, body: { name: to } });
const tagsOf = async (token: string, id: string) =>
  ((await call("get", "/bookmarks/{id}", { token, params: { id } })).body as { tags: string[] }).tags;

test("renaming a tag lowercases the new name and moves the bookmark to it", async () => {
  const { token } = await signUpFresh();
  const b1 = await saveFreshBookmark(token);
  await putTag(token, b1, "js");
  const res = await rename(token, "js", "JavaScript");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ name: "javascript", count: 1 });
  expect(await tagsOf(token, b1)).toEqual(["javascript"]);
});

test("renaming into an existing tag merges: counts add, no duplicates, old name gone", async () => {
  const { token } = await signUpFresh();
  const b1 = await saveFreshBookmark(token);
  const b2 = await saveFreshBookmark(token);
  const b3 = await saveFreshBookmark(token);
  await putTag(token, b2, "ts");
  await putTag(token, b2, "web");
  await putTag(token, b3, "web");
  const res = await rename(token, "ts", "web");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ name: "web", count: 2 });
  expect(await tagsOf(token, b2)).toEqual(["web"]);
  expect(await tagsOf(token, b3)).toEqual(["web"]);
  expect(await tagsOf(token, b1)).toEqual([]);
});

test("a bookmark with 10 tags renamed into one it already has keeps 9 tags", async () => {
  const { token } = await signUpFresh();
  const id = await saveFreshBookmark(token);
  for (let i = 0; i < 10; i++) await putTag(token, id, `t${i}`);
  const res = await rename(token, "t0", "t1");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ name: "t1", count: 1 });
  const tags = await tagsOf(token, id);
  expect(tags).toHaveLength(9);
  expect(tags).not.toContain("t0");
});

test("an unknown tag is 404 not_found", async () => {
  const { token } = await signUpFresh();
  const res = await rename(token, "unknown", "x");
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ error: { code: "not_found" } });
});

test("an invalid new name is 400 naming name, and the tag is unchanged", async () => {
  const { token } = await signUpFresh();
  const id = await saveFreshBookmark(token);
  await putTag(token, id, "js");
  const res = await rename(token, "js", "bad_tag");
  expect(res.status).toBe(400);
  expect((res.body as { error: { message: string } }).error.message).toContain("name");
  expect(await tagsOf(token, id)).toEqual(["js"]);
});

test("renaming never changes a second user's tags", async () => {
  const me = await signUpFresh();
  const other = await signUpFresh();
  const mine = await saveFreshBookmark(me.token);
  const theirs = await saveFreshBookmark(other.token);
  await putTag(me.token, mine, "js");
  await putTag(other.token, theirs, "js");
  const res = await rename(me.token, "js", "javascript");
  expect(res.body).toEqual({ name: "javascript", count: 1 });
  expect(await tagsOf(other.token, theirs)).toEqual(["js"]);
  expect((await rename(other.token, "javascript", "x")).status).toBe(404);
});

test("without a token: 401 unauthorized", async () => {
  const res = await rename(undefined, "js", "javascript");
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
