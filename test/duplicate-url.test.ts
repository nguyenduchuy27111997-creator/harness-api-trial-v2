import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const URL_DUP = "https://example.com/dup";

test("a duplicate url is 409 duplicate_url with the existing id; a trailing slash is different", async () => {
  const { token } = await signUpFresh();
  const first = await call("post", "/bookmarks", { token, body: { url: URL_DUP } });
  expect(first.status).toBe(201);
  const firstId = (first.body as { id: string }).id;

  const dup = await call("post", "/bookmarks", { token, body: { url: `  ${URL_DUP}  ` } });
  expect(dup.status).toBe(409);
  expect((dup.body as { error: { code: string; existing_id: string } }).error).toMatchObject({
    code: "duplicate_url",
    existing_id: firstId,
  });

  const slash = await call("post", "/bookmarks", { token, body: { url: `${URL_DUP}/` } });
  expect(slash.status).toBe(201);
  expect((slash.body as { id: string }).id).not.toBe(firstId);
});

test("duplicates are per user", async () => {
  const a = await signUpFresh();
  const b = await signUpFresh();
  expect((await call("post", "/bookmarks", { token: a.token, body: { url: URL_DUP } })).status).toBe(201);
  expect((await call("post", "/bookmarks", { token: b.token, body: { url: URL_DUP } })).status).toBe(201);
});
