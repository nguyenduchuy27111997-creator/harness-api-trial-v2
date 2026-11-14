import { z } from "@hono/zod-openapi";
import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

// Every error body is { error: { code, message } } (docs/design/M1.md, Contract).
export const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const apiError = <S extends 400 | 401 | 404 | 409 | 500>(c: Context, status: S, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

// Route-level zod hook: 400 validation_error whose message starts with the first issue's field path.
export const validationHook = (result: { success: boolean; error?: z.ZodError }, c: Context) => {
  if (result.success) return undefined;
  const issue = result.error!.issues[0]!;
  return apiError(c, 400, "validation_error", `${issue.path.join(".")}: ${issue.message}`);
};

// Malformed JSON is Hono's 400 HTTPException; anything else is a generic 500 (no SQL, stack or body logged).
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException && err.status === 400) {
    return apiError(c, 400, "validation_error", "body: request body is not valid JSON");
  }
  console.error("unhandled error:", err instanceof Error ? err.message : "unknown");
  return apiError(c, 500, "internal_error", "Internal server error");
};

// Route middleware for routes with a JSON body: zod only parses a body sent as JSON, so any other
// content type would reach the handler unparsed. Answer it as the client error it is.
export const requireJson: MiddlewareHandler = async (c, next) => {
  if (!c.req.header("content-type")?.includes("json")) {
    return apiError(c, 400, "validation_error", "body: content-type must be application/json");
  }
  await next();
};
