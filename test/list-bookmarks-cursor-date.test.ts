import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";
import { call } from "./contract.js";
import { signUpFresh } from "./helpers.js";

afterAll(() => sql.end());

const cursorOf = (c: string) =>
  Buffer.from(JSON.stringify({ c, i: "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b" })).toString("base64url");

test.each(["2024-02-31T00:00:00.000000Z", "2023-02-29T00:00:00.000000Z", "2024-13-01T00:00:00.000000Z", "2024-01-01T24:00:00.000000Z"])(
  "a cursor holding the nonexistent date %s is 400 invalid_cursor",
  async (c) => {
    const { token } = await signUpFresh();
    const res = await call("get", "/bookmarks", { token, query: { cursor: cursorOf(c) } });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("invalid_cursor");
  },
);
