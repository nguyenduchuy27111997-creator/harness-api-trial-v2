import { expect, test } from "vitest";
import { rateLimitedResponse } from "../src/lib/rate-limit.js";

test("the shared 429 response accepts a rate_limited error body", () => {
  const schema = rateLimitedResponse.content["application/json"].schema;
  expect(schema.safeParse({ error: { code: "rate_limited", message: "slow down" } }).success).toBe(true);
  expect(schema.safeParse({ error: { code: "other", message: "x" } }).success).toBe(false);
});
