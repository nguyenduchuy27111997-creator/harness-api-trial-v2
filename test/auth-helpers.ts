import { call } from "./contract.js";

// Unique per run and per lane (golden principle 7); lowercase so it equals the stored email.
let n = 0;
export const uniqueEmail = () =>
  `me+${process.env.HARNESS_LANE ?? "x"}-${Date.now()}-${n++}@example.com`.toLowerCase();

export const signUpAs = (email: string, password = "correct-horse") =>
  call("post", "/auth/sign-up", { body: { email, password } });

export const signInAs = (body: Record<string, unknown>) => call("post", "/auth/sign-in", { body });
