import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// Lets the tools tell this API apart from anything else on the same port.
const route = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      description: "This API is up",
      content: { "application/json": { schema: z.object({ app: z.string() }) } },
    },
  },
});

export const health = new OpenAPIHono().openapi(route, (c) => c.json({ app: "__APP_NAME__" }, 200));
