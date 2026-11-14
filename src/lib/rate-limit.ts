import { z } from "@hono/zod-openapi";

// M2 scaffold (docs/design/M2.md): the 429 every rate-limited route documents.
// F107 adds `hit` and the check in requireAuth; F109 the sign-in check.
export const rateLimitedResponse = {
  description: "Too many requests in the current window",
  headers: z.object({ "Retry-After": z.string().openapi({ description: "Whole seconds until the window resets, at least 1" }) }),
  content: {
    "application/json": {
      schema: z.object({ error: z.object({ code: z.literal("rate_limited"), message: z.string() }) }),
    },
  },
} as const;
