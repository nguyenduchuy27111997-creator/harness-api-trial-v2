import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requireAuth } from "../lib/auth.js";
import { apiError, ErrorSchema, requireJson, validationHook } from "../lib/errors.js";
import { rateLimitedResponse } from "../lib/rate-limit.js";
import { addTag, listTags, removeTag, renameTag, TagName } from "../lib/tags.js";

const BookmarkSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  read_at: z.string().nullable(),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

const err = (description: string) => ({ description, content: { "application/json": { schema: ErrorSchema } } });

const addTagRouteDef = createRoute({
  method: "put",
  path: "/bookmarks/{id}/tags/{tag}",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { params: z.object({ id: z.string(), tag: TagName }) },
  responses: {
    200: { description: "The bookmark with its tags", content: { "application/json": { schema: BookmarkSchema } } },
    400: err("Validation error or too_many_tags"),
    401: err("Missing or invalid token"),
    404: err("Not found"),
    429: rateLimitedResponse,
    500: err("Unexpected error"),
  },
});

const removeTagRouteDef = createRoute({
  method: "delete",
  path: "/bookmarks/{id}/tags/{tag}",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { params: z.object({ id: z.string(), tag: TagName }) },
  responses: {
    200: { description: "The bookmark with its tags", content: { "application/json": { schema: BookmarkSchema } } },
    400: err("Validation error"),
    401: err("Missing or invalid token"),
    404: err("Not found"),
    429: rateLimitedResponse,
    500: err("Unexpected error"),
  },
});

const listTagsRouteDef = createRoute({
  method: "get",
  path: "/tags",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  responses: {
    200: {
      description: "My tags with bookmark counts, by name",
      content: { "application/json": { schema: z.object({ items: z.array(z.object({ name: z.string(), count: z.number().int() })) }) } },
    },
    401: err("Missing or invalid token"),
    429: rateLimitedResponse,
    500: err("Unexpected error"),
  },
});

const renameTagRouteDef = createRoute({
  method: "patch",
  path: "/tags/{name}",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireJson],
  request: {
    params: z.object({ name: z.string() }),
    body: { required: true, content: { "application/json": { schema: z.object({ name: TagName }) } } },
  },
  responses: {
    200: {
      description: "The new tag name with its bookmark count",
      content: { "application/json": { schema: z.object({ name: z.string(), count: z.number().int() }) } },
    },
    400: err("Validation error"),
    401: err("Missing or invalid token"),
    404: err("Not found"),
    429: rateLimitedResponse,
    500: err("Unexpected error"),
  },
});

export const tags = new OpenAPIHono<{ Variables: { userId: string; tokenId: string } }>({
  defaultHook: validationHook,
}).openapi(addTagRouteDef, async (c) => {
  const { id, tag } = c.req.valid("param");
  const result = await addTag(c.var.userId, id, tag);
  if (result === "not_found") return apiError(c, 404, "not_found", "Bookmark not found");
  if (result === "too_many_tags") return apiError(c, 400, "too_many_tags", "A bookmark can have at most 10 tags");
  return c.json(result, 200);
})
  .openapi(removeTagRouteDef, async (c) => {
    const { id, tag } = c.req.valid("param");
    const result = await removeTag(c.var.userId, id, tag);
    if (result === "not_found") return apiError(c, 404, "not_found", "Bookmark not found");
    return c.json(result, 200);
  })
  .openapi(listTagsRouteDef, async (c) => c.json({ items: await listTags(c.var.userId) }, 200))
  .openapi(renameTagRouteDef, async (c) => {
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await renameTag(c.var.userId, name, body.name);
    if (result === "not_found") return apiError(c, 404, "not_found", "Tag not found");
    return c.json(result, 200);
  });
