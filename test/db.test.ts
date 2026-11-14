import { afterAll, expect, test } from "vitest";
import { sql } from "../src/db/client.js";

afterAll(() => sql.end());

test("the test database answers", async () => {
  expect(await sql`select 1 as one`).toEqual([{ one: 1 }]);
});
