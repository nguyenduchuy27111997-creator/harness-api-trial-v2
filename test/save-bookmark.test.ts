import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test("POST /bookmarks trims the url and defaults the title to it", async () => {
  const { token } = await signUpFresh();
  const url = `https://example.com/a-${Date.now()}`;
  const res = await call("post", "/bookmarks", { token, body: { url: ` ${url} ` } });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    url, title: url, note: null, read_at: null, tags: [],
  });
  const b = res.body as { id: string; created_at: string; updated_at: string };
  expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(b.created_at).toMatch(ISO);
  expect(b.updated_at).toMatch(ISO);
});

test("POST /bookmarks keeps the given title and note", async () => {
  const { token } = await signUpFresh();
  const url = `https://example.com/b-${Date.now()}`;
  const res = await call("post", "/bookmarks", { token, body: { url, title: "B", note: "why" } });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ url, title: "B", note: "why" });
});

test.each([
  ["ftp scheme", "ftp://x.y"],
  ["not a url", "not a url"],
  ["relative path", "/path"],
])("POST /bookmarks with %s is 400 validation_error naming url", async (_n, url) => {
  const { token } = await signUpFresh();
  const res = await call("post", "/bookmarks", { token, body: { url } });
  expect(res.status).toBe(400);
  const err = (res.body as { error: { code: string; message: string } }).error;
  expect(err.code).toBe("validation_error");
  expect(err.message).toContain("url");
});

test("POST /bookmarks with no url is 400 validation_error naming url", async () => {
  const { token } = await signUpFresh();
  const res = await call("post", "/bookmarks", { token, body: { title: "x" } });
  expect(res.status).toBe(400);
  const err = (res.body as { error: { code: string; message: string } }).error;
  expect(err.code).toBe("validation_error");
  expect(err.message).toContain("url");
});

test.each([
  ["url", { url: `https://example.com/${"a".repeat(2049 - 20)}` }],
  ["title", { url: "https://example.com/t", title: "t".repeat(501) }],
  ["note", { url: "https://example.com/n", note: "n".repeat(10001) }],
])("POST /bookmarks with an over-long %s is 400 naming the field", async (field, body) => {
  const { token } = await signUpFresh();
  const res = await call("post", "/bookmarks", { token, body });
  expect(res.status).toBe(400);
  const err = (res.body as { error: { code: string; message: string } }).error;
  expect(err.code).toBe("validation_error");
  expect(err.message).toContain(field);
});

test("POST /bookmarks without a token is 401 unauthorized", async () => {
  const res = await call("post", "/bookmarks", { body: { url: "https://example.com/x" } });
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
