import { expect, test } from "vitest";
import { call } from "./contract.js";

test("health names this API and matches the contract", async () => {
  const res = await call("get", "/health");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ app: "marklist" });
});
