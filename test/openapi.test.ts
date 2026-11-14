import { expect, test } from "vitest";
import doc from "../openapi.json" with { type: "json" };
import { app } from "../src/app.js";

test("the API serves the committed contract", async () => {
  const res = await app.request("/openapi.json");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(doc);
});
