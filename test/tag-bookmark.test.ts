import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const PATH = "/bookmarks/{id}/tags/{tag}" as const;
const putTag = (token: string | undefined, id: string, tag: string) =>
  call("put", PATH, { token, params: { id, tag } });

async function saveBookmark(token: string) {
  const res = await call("post", "/bookmarks", { token, body: { url: `https://example.com/tag-${Date.now()}-${Math.random()}` } });
  expect(res.status).toBe(201);
  return (res.body as { id: string }).id;
}

test("PUT a tag lowercases it and returns the bookmark with it", async () => {
  const { token } = await signUpFresh();
  const id = await saveBookmark(token);
  const res = await putTag(token, id, "Reading");
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id, tags: ["reading"] });
});

test("PUT the same tag again is idempotent", async () => {
  const { token } = await signUpFresh();
  const id = await saveBookmark(token);
  await putTag(token, id, "Reading");
  const res = await putTag(token, id, "reading");
  expect(res.status).toBe(200);
  expect((res.body as { tags: string[] }).tags).toEqual(["reading"]);
});

test.each([
  ["bad_tag", "bad_tag"],
  ["a 33-char tag", "a".repeat(33)],
])("PUT %s is 400 validation_error naming tag", async (_n, tag) => {
  const { token } = await signUpFresh();
  const id = await saveBookmark(token);
  const res = await putTag(token, id, tag);
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: { code: "validation_error" } });
  expect((res.body as { error: { message: string } }).error.message).toContain("tag");
});

test("an 11th tag is 400 too_many_tags; re-adding one of the 10 is still 200", async () => {
  const { token } = await signUpFresh();
  const id = await saveBookmark(token);
  for (let i = 0; i < 10; i++) expect((await putTag(token, id, `t${i}`)).status).toBe(200);
  const eleventh = await putTag(token, id, "t10");
  expect(eleventh.status).toBe(400);
  expect(eleventh.body).toMatchObject({ error: { code: "too_many_tags" } });
  expect((await putTag(token, id, "t3")).status).toBe(200);
});

test("GET /bookmarks/{id} shows tags sorted by name", async () => {
  const { token } = await signUpFresh();
  const id = await saveBookmark(token);
  for (const t of ["zebra", "apple", "mango"]) await putTag(token, id, t);
  const res = await call("get", "/bookmarks/{id}", { token, params: { id } });
  expect(res.status).toBe(200);
  expect((res.body as { tags: string[] }).tags).toEqual(["apple", "mango", "zebra"]);
});

test("another user's bookmark is 404 not_found", async () => {
  const owner = await signUpFresh();
  const other = await signUpFresh();
  const id = await saveBookmark(owner.token);
  const res = await putTag(other.token, id, "reading");
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ error: { code: "not_found" } });
});

test("PUT a tag without a token is 401 unauthorized", async () => {
  const { token } = await signUpFresh();
  const id = await saveBookmark(token);
  const res = await putTag(undefined, id, "reading");
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
