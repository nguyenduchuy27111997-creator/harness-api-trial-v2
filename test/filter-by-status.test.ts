import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Page = { items: { id: string; title: string }[]; next_cursor: string | null };
type Err = { error: { code: string; message: string } };

const titles = (p: Page) => p.items.map((i) => i.title);

// Saves A, B, C (oldest to newest), marks B read, returns the token.
async function seed() {
  const { token } = await signUpFresh();
  let bId = "";
  for (const title of ["A", "B", "C"]) {
    const url = `https://example.com/${title}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await call("post", "/bookmarks", { token, body: { url, title } });
    expect(res.status).toBe(201);
    if (title === "B") bId = (res.body as { id: string }).id;
  }
  const read = await call("put", "/bookmarks/{id}/read", { token, params: { id: bId } });
  expect(read.status).toBe(200);
  return token;
}

test("status=read returns only the read bookmark", async () => {
  const token = await seed();
  const res = await call("get", "/bookmarks", { token, query: { status: "read" } });
  expect(res.status).toBe(200);
  expect(titles(res.body as Page)).toEqual(["B"]);
});

test("status=unread returns the other two, newest first", async () => {
  const token = await seed();
  const res = await call("get", "/bookmarks", { token, query: { status: "unread" } });
  expect(res.status).toBe(200);
  expect(titles(res.body as Page)).toEqual(["C", "A"]);
});

test("status=unread&limit=1 pages through the unread ones", async () => {
  const token = await seed();
  const first = await call("get", "/bookmarks", { token, query: { status: "unread", limit: "1" } });
  expect(first.status).toBe(200);
  const p1 = first.body as Page;
  expect(titles(p1)).toEqual(["C"]);
  expect(p1.next_cursor).toEqual(expect.any(String));

  const second = await call("get", "/bookmarks", {
    token,
    query: { status: "unread", limit: "1", cursor: p1.next_cursor as string },
  });
  expect(second.status).toBe(200);
  const p2 = second.body as Page;
  expect(titles(p2)).toEqual(["A"]);
  expect(p2.next_cursor).toBeNull();
});

test("status=done is a validation_error naming status", async () => {
  const { token } = await signUpFresh();
  const res = await call("get", "/bookmarks", { token, query: { status: "done" } });
  expect(res.status).toBe(400);
  const err = res.body as Err;
  expect(err.error.code).toBe("validation_error");
  expect(err.error.message).toContain("status");
});
