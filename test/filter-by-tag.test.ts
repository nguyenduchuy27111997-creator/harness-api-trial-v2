import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Page = { items: { id: string; title: string }[]; next_cursor: string | null };
const titles = (p: Page) => p.items.map((i) => i.title);
const list = (token: string, query: Record<string, string>) => call("get", "/bookmarks", { token, query });

// Saves A, B, C (oldest to newest), tags A and B "go", marks A read, returns the token.
async function seed() {
  const { token } = await signUpFresh();
  const ids: Record<string, string> = {};
  for (const title of ["A", "B", "C"]) {
    const url = `https://example.com/${title}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await call("post", "/bookmarks", { token, body: { url, title } });
    expect(res.status).toBe(201);
    ids[title] = (res.body as { id: string }).id;
  }
  for (const t of ["A", "B"]) {
    expect((await call("put", "/bookmarks/{id}/tags/{tag}", { token, params: { id: ids[t]!, tag: "go" } })).status).toBe(200);
  }
  expect((await call("put", "/bookmarks/{id}/read", { token, params: { id: ids.A! } })).status).toBe(200);
  return token;
}

test("tag=go returns the two tagged, newest first; Go is the same", async () => {
  const token = await seed();
  for (const tag of ["go", "Go"]) {
    const res = await list(token, { tag });
    expect(res.status).toBe(200);
    expect(titles(res.body as Page)).toEqual(["B", "A"]);
  }
});

test("tag=go&status=unread returns only the unread one", async () => {
  const token = await seed();
  const res = await list(token, { tag: "go", status: "unread" });
  expect(res.status).toBe(200);
  expect(titles(res.body as Page)).toEqual(["B"]);
});

test("tag=go&limit=1 pages: the newest, then the second, then null", async () => {
  const token = await seed();
  const p1 = (await list(token, { tag: "go", limit: "1" })).body as Page;
  expect(titles(p1)).toEqual(["B"]);
  expect(p1.next_cursor).toEqual(expect.any(String));
  const p2 = (await list(token, { tag: "go", limit: "1", cursor: p1.next_cursor! })).body as Page;
  expect(titles(p2)).toEqual(["A"]);
  expect(p2.next_cursor).toBeNull();
});

test("an unused tag gives an empty page", async () => {
  const token = await seed();
  const res = await list(token, { tag: "nope" });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [], next_cursor: null });
});

test("an invalid tag is 400 naming tag", async () => {
  const token = await seed();
  const res = await list(token, { tag: "bad_tag" });
  expect(res.status).toBe(400);
  expect((res.body as { error: { code: string; message: string } }).error.message).toContain("tag");
});
