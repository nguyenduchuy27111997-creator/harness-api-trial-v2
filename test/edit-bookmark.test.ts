import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

type Saved = { id: string; url: string; title: string; note: string | null; updated_at: string };

async function saveWithNote() {
  const { token } = await signUpFresh();
  const url = `https://example.com/edit-${Date.now()}-${Math.random()}`;
  const res = await call("post", "/bookmarks", { token, body: { url, title: "Old", note: "keep me" } });
  expect(res.status).toBe(201);
  return { token, saved: res.body as Saved };
}

test("PATCH title changes the title, keeps the note, and bumps updated_at", async () => {
  const { token, saved } = await saveWithNote();
  await new Promise((r) => setTimeout(r, 20));
  const res = await call("patch", "/bookmarks/{id}", { token, params: { id: saved.id }, body: { title: "New" } });
  expect(res.status).toBe(200);
  const body = res.body as Saved;
  expect(body.title).toBe("New");
  expect(body.note).toBe("keep me");
  expect(Date.parse(body.updated_at)).toBeGreaterThan(Date.parse(saved.updated_at));
});

test("PATCH note null clears the note", async () => {
  const { token, saved } = await saveWithNote();
  const res = await call("patch", "/bookmarks/{id}", { token, params: { id: saved.id }, body: { note: null } });
  expect(res.status).toBe(200);
  expect((res.body as Saved).note).toBeNull();
});

test("PATCH an empty title is 400 validation_error naming title", async () => {
  const { token, saved } = await saveWithNote();
  const res = await call("patch", "/bookmarks/{id}", { token, params: { id: saved.id }, body: { title: "" } });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ error: { code: "validation_error" } });
  expect((res.body as { error: { message: string } }).error.message).toContain("title");
});

test("PATCH url is ignored: the url stays the original", async () => {
  const { token, saved } = await saveWithNote();
  const res = await call("patch", "/bookmarks/{id}", {
    token, params: { id: saved.id }, body: { url: "https://other.example" },
  });
  expect(res.status).toBe(200);
  expect((res.body as Saved).url).toBe(saved.url);
});

test("PATCH another user's bookmark is 404 not_found", async () => {
  const { saved } = await saveWithNote();
  const other = await signUpFresh();
  const res = await call("patch", "/bookmarks/{id}", {
    token: other.token, params: { id: saved.id }, body: { title: "Hijack" },
  });
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ error: { code: "not_found" } });
});

test("PATCH without a token is 401 unauthorized", async () => {
  const { saved } = await saveWithNote();
  const res = await call("patch", "/bookmarks/{id}", { params: { id: saved.id }, body: { title: "x" } });
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
});
