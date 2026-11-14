import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { signUp } from "../lib/auth.js";
import { apiError, ErrorSchema, requireJson, validationHook } from "../lib/errors.js";

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

export const auth = new OpenAPIHono({ defaultHook: validationHook }).openapi(signUpRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const created = await signUp(email, password);
  if (!created) return apiError(c, 409, "email_taken", "An account with this email already exists");
  return c.json(created, 201);
});
