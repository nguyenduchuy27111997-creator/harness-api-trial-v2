import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Page = { items: { id: string; title: string }[]; next_cursor: string | null };
type Err = { error: { code: string; message: string } };

async function save(token: string, title: string) {
  const url = `https://example.com/${title}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await call("post", "/bookmarks", { token, body: { url, title } });
  expect(res.status).toBe(201);
}

async function saveABC(token: string) {
  for (const t of ["A", "B", "C"]) await save(token, t);
}

const titles = (p: Page) => p.items.map((i) => i.title);

test("a fresh user with no bookmarks gets an empty page", async () => {
  const { token } = await signUpFresh();
  const res = await call("get", "/bookmarks", { token });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [], next_cursor: null });
});

test("limit=2 returns the newest two, then the cursor returns the last one", async () => {
  const { token } = await signUpFresh();
  await saveABC(token);
  const first = await call("get", "/bookmarks", { token, query: { limit: "2" } });
  expect(first.status).toBe(200);
  const p1 = first.body as Page;
  expect(titles(p1)).toEqual(["C", "B"]);
  expect(p1.next_cursor).toEqual(expect.any(String));

  const second = await call("get", "/bookmarks", { token, query: { limit: "2", cursor: p1.next_cursor! } });
  expect(second.status).toBe(200);
  const p2 = second.body as Page;
  expect(titles(p2)).toEqual(["A"]);
  expect(p2.next_cursor).toBeNull();
});

test("default list is newest first and never shows another user's bookmarks", async () => {
  const me = await signUpFresh();
  const other = await signUpFresh();
  await saveABC(me.token);
  await save(other.token, "OTHER");
  const res = await call("get", "/bookmarks", { token: me.token });
  expect(res.status).toBe(200);
  const p = res.body as Page;
  expect(titles(p)).toEqual(["C", "B", "A"]);
  expect(p.next_cursor).toBeNull();
});

test.each(["0", "101", "abc"])("limit=%s is 400 validation_error naming limit", async (limit) => {
  const { token } = await signUpFresh();
  const res = await call("get", "/bookmarks", { token, query: { limit } });
  expect(res.status).toBe(400);
  const err = (res.body as Err).error;
  expect(err.code).toBe("validation_error");
  expect(err.message).toContain("limit");
});

test("a garbage cursor is 400 invalid_cursor", async () => {
  const { token } = await signUpFresh();
  const res = await call("get", "/bookmarks", { token, query: { cursor: "garbage" } });
  expect(res.status).toBe(400);
  expect((res.body as Err).error.code).toBe("invalid_cursor");
});

test("a next_cursor with changed characters is 400 invalid_cursor", async () => {
  const { token } = await signUpFresh();
  await saveABC(token);
  const first = await call("get", "/bookmarks", { token, query: { limit: "2" } });
  const cursor = (first.body as Page).next_cursor!;
  const tampered = `!!${cursor.slice(2)}`;
  const res = await call("get", "/bookmarks", { token, query: { cursor: tampered } });
  expect(res.status).toBe(400);
  expect((res.body as Err).error.code).toBe("invalid_cursor");
});
