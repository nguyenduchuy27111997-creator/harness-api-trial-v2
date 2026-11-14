import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

// The tag filter has no bookmark_tags.user_id condition (decision 0006): another user's tag of the same name must not leak.
test("tag filter shows only the caller's bookmarks when two users use the same tag", async () => {
  const titles: string[] = [];
  const tokens: string[] = [];
  for (const title of ["mine", "theirs"]) {
    const { token } = await signUpFresh();
    const url = `https://example.com/${title}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const created = await call("post", "/bookmarks", { token, body: { url, title } });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    expect((await call("put", "/bookmarks/{id}/tags/{tag}", { token, params: { id, tag: "shared" } })).status).toBe(200);
    titles.push(title);
    tokens.push(token);
  }
  for (const [i, token] of tokens.entries()) {
    const res = await call("get", "/bookmarks", { token, query: { tag: "shared" } });
    expect(res.status).toBe(200);
    expect((res.body as { items: { title: string }[] }).items.map((b) => b.title)).toEqual([titles[i]]);
  }
});
