import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requireAuth, revokeToken, signIn, signUp } from "../lib/auth.js";
import { apiError, ErrorSchema, requireJson, validationHook } from "../lib/errors.js";
import { hit, rateLimited, rateLimitedResponse } from "../lib/rate-limit.js";

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email address");

const UserSchema = z.object({ id: z.uuid(), email: z.string(), created_at: z.string() });

const signUpRoute = createRoute({
  method: "post",
  path: "/auth/sign-up",
  middleware: [requireJson],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: z.object({ email: Email, password: z.string().min(8).max(128) }) } },
    },
  },
  responses: {
    201: {
      description: "Account created",
      content: { "application/json": { schema: z.object({ user: UserSchema, token: z.string() }) } },
    },
    400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    409: { description: "Email already registered", content: { "application/json": { schema: ErrorSchema } } },
    500: { description: "Unexpected error", content: { "application/json": { schema: ErrorSchema } } },
  },
});

const signInRoute = createRoute({
  method: "post",
  path: "/auth/sign-in",
  middleware: [requireJson],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: z.object({ email: Email, password: z.string().min(1).max(128) }) } },
    },
  },
  responses: {
    200: {
      description: "Signed in",
      content: { "application/json": { schema: z.object({ user: UserSchema, token: z.string() }) } },
    },
    400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    401: { description: "Invalid credentials", content: { "application/json": { schema: ErrorSchema } } },
    429: rateLimitedResponse,
    500: { description: "Unexpected error", content: { "application/json": { schema: ErrorSchema } } },
  },
});

const signOutRoute = createRoute({
  method: "post",
  path: "/auth/sign-out",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  responses: {
    204: { description: "Token revoked" },
    401: { description: "Missing or invalid token", content: { "application/json": { schema: ErrorSchema } } },
    429: rateLimitedResponse,
    500: { description: "Unexpected error", content: { "application/json": { schema: ErrorSchema } } },
  },
});

export const auth = new OpenAPIHono<{ Variables: { userId: string; tokenId: string } }>({ defaultHook: validationHook }).openapi(signUpRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const created = await signUp(email, password);
  if (!created) return apiError(c, 409, "email_taken", "An account with this email already exists");
  return c.json(created, 201);
}).openapi(signInRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const limit = await hit(`sign-in:${email}`, 10, 900);
  if (limit.limited) return rateLimited(c, limit.retryAfter);
  const result = await signIn(email, password);
  if (!result) return apiError(c, 401, "invalid_credentials", "Email or password is incorrect");
  return c.json(result, 200);
}).openapi(signOutRoute, async (c) => {
  await revokeToken(c.var.userId, c.var.tokenId);
  return c.body(null, 204);
});
