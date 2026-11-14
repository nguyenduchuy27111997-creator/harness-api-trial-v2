import { randomUUID } from "node:crypto";
import { call } from "./contract.js";

// Unique per run and per lane (golden principle 7); lowercase so it equals the stored email.
let n = 0;
export const uniqueEmail = () =>
  `me+${process.env.HARNESS_LANE ?? "x"}-${Date.now()}-${n++}-${randomUUID().slice(0, 8)}@example.com`.toLowerCase();

// Signs up a fresh user through the API and returns the user and bearer token.
export async function signUpFresh(password = "correct-horse") {
  const email = uniqueEmail();
  const res = await call("post", "/auth/sign-up", { body: { email, password } });
  return res.body as { user: { id: string; email: string; created_at: string }; token: string };
}

// Saves a bookmark with a unique URL through the API and returns its id.
export async function saveFreshBookmark(token: string) {
  const res = await call("post", "/bookmarks", { token, body: { url: `https://example.com/${randomUUID()}` } });
  return (res.body as { id: string }).id;
}
