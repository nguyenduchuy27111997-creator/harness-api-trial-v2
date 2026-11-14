import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Page = { items: { id: string; title: string; note: string | null }[]; next_cursor: string | null };
const list = (token: string, query: Record<string, string>) => call("get", "/bookmarks", { token, query });
const ids = (p: unknown) => (p as Page).items.map((i) => i.id);

const save = async (token: string, body: Record<string, string>) => {
  const res = await call("post", "/bookmarks", { token, body });
  expect(res.status).toBe(201);
  return (res.body as { id: string }).id;
};

// Saves A {title "Rust book"}, B {url go.dev/doc}, C {note "zebra migration notes"}.
async function seed() {
  const { token } = await signUpFresh();
  const u = randomUUID();
  const a = await save(token, { url: `https://example.com/${u}/a`, title: "Rust book" });
  const b = await save(token, { url: "https://go.dev/doc" });
  const c = await save(token, { url: `https://example.com/${u}/c`, note: "zebra migration notes" });
  return { token, a, b, c };
}

test("q matches title, url and note words", async () => {
  const { token, a, b, c } = await seed();
  const zebra = await list(token, { q: "zebra" });
  expect(zebra.status).toBe(200);
  expect(ids(zebra.body)).toEqual([c]);
  expect(ids((await list(token, { q: "rust" })).body)).toEqual([a]);
  expect(ids((await list(token, { q: "go.dev" })).body)).toEqual([b]);
});

test("q combines with tag and status", async () => {
  const { token, c } = await seed();
  expect((await call("put", "/bookmarks/{id}/tags/{tag}", { token, params: { id: c, tag: "x" } })).status).toBe(200);
  expect((await call("put", "/bookmarks/{id}/read", { token, params: { id: c } })).status).toBe(200);
  expect(ids((await list(token, { q: "zebra", tag: "x", status: "read" })).body)).toEqual([c]);
  const unread = await list(token, { q: "zebra", status: "unread" });
  expect(unread.status).toBe(200);
  expect((unread.body as Page).items).toEqual([]);
});

test("q with limit=1 returns newest first and next_cursor reaches the second", async () => {
  const { token } = await signUpFresh();
  const u = randomUUID();
  const older = await save(token, { url: `https://example.com/${u}/1`, note: "reading notes one" });
  const newer = await save(token, { url: `https://example.com/${u}/2`, note: "reading notes two" });
  const first = await list(token, { q: "notes", limit: "1" });
  expect(first.status).toBe(200);
  expect(ids(first.body)).toEqual([newer]);
  const cursor = (first.body as Page).next_cursor;
  expect(cursor).toBeTruthy();
  const second = await list(token, { q: "notes", limit: "1", cursor: cursor! });
  expect(second.status).toBe(200);
  expect(ids(second.body)).toEqual([older]);
});

test("empty q is the same as no q", async () => {
  const { token, a, b, c } = await seed();
  const res = await list(token, { q: "" });
  expect(res.status).toBe(200);
  expect(ids(res.body)).toEqual([c, b, a]);
  expect(ids(res.body)).toEqual(ids((await list(token, {})).body));
});

test("another user's matching bookmarks never appear", async () => {
  const owner = await seed();
  const other = await signUpFresh();
  const mine = await save(other.token, { url: `https://example.com/${randomUUID()}`, note: "zebra of mine" });
  expect(ids((await list(other.token, { q: "zebra" })).body)).toEqual([mine]);
  expect(ids((await list(owner.token, { q: "zebra" })).body)).toEqual([owner.c]);
});
