import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getUser, requireAuth } from "../lib/auth.js";
import { apiError, ErrorSchema, validationHook } from "../lib/errors.js";
import { rateLimitedResponse } from "../lib/rate-limit.js";

const UserSchema = z.object({ id: z.uuid(), email: z.string(), created_at: z.string() });

const meRoute = createRoute({
  method: "get",
  path: "/me",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  responses: {
    200: { description: "The signed-in user", content: { "application/json": { schema: UserSchema } } },
    401: { description: "Missing or invalid token", content: { "application/json": { schema: ErrorSchema } } },
    429: rateLimitedResponse,
    500: { description: "Unexpected error", content: { "application/json": { schema: ErrorSchema } } },
  },
});

export const me = new OpenAPIHono<{ Variables: { userId: string; tokenId: string } }>({
  defaultHook: validationHook,
}).openapi(meRoute, async (c) => {
  const user = await getUser(c.var.userId);
  if (!user) return apiError(c, 401, "unauthorized", "Missing or invalid bearer token");
  return c.json(user, 200);
});
