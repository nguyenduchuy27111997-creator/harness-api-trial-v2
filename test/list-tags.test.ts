import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { saveFreshBookmark, signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const putTag = (token: string, id: string, tag: string) =>
  call("put", "/bookmarks/{id}/tags/{tag}", { token, params: { id, tag } });
const listTags = (token?: string) => call("get", "/tags", { token });

test("a fresh user has no tags: 200 {items: []}", async () => {
  const { token } = await signUpFresh();
  const res = await listTags(token);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [] });
});

test("tags are listed by name with the number of bookmarks carrying each", async () => {
  const { token } = await signUpFresh();
  const a = await saveFreshBookmark(token);
  const b = await saveFreshBookmark(token);
  await putTag(token, a, "read-later");
  await putTag(token, b, "read-later");
  await putTag(token, a, "go");
  const res = await listTags(token);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [{ name: "go", count: 1 }, { name: "read-later", count: 2 }] });
});

test("removing a tag from its only bookmark drops it from the list", async () => {
  const { token } = await signUpFresh();
  const a = await saveFreshBookmark(token);
  const b = await saveFreshBookmark(token);
  await putTag(token, a, "read-later");
  await putTag(token, b, "read-later");
  await putTag(token, a, "go");
  await call("delete", "/bookmarks/{id}/tags/{tag}", { token, params: { id: a, tag: "go" } });
  const res = await listTags(token);
  expect(res.body).toEqual({ items: [{ name: "read-later", count: 2 }] });
});

test("a second user's tags never appear", async () => {
  const me = await signUpFresh();
  const other = await signUpFresh();
  await putTag(other.token, await saveFreshBookmark(other.token), "secret");
  await putTag(me.token, await saveFreshBookmark(me.token), "mine");
  expect((await listTags(me.token)).body).toEqual({ items: [{ name: "mine", count: 1 }] });
  expect((await listTags(other.token)).body).toEqual({ items: [{ name: "secret", count: 1 }] });
});

test("without a token: 401 unauthorized", async () => {
  const res = await listTags();
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
