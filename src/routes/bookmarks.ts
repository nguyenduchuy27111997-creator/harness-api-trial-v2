import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requireAuth } from "../lib/auth.js";
import { createBookmark, deleteBookmark, findBookmarkIdByUrl, getBookmark, listBookmarks, markBookmarkRead, markBookmarkUnread, updateBookmark } from "../lib/bookmarks.js";
import { decodeCursor, LimitSchema } from "../lib/pagination.js";
import { apiError, ErrorSchema, requireJson, validationHook } from "../lib/errors.js";
import { rateLimitedResponse } from "../lib/rate-limit.js";

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

const Url = z
  .string()
  .trim()
  .max(2048)
  .refine((s) => {
    try {
      return ["http:", "https:"].includes(new URL(s).protocol);
    } catch {
      return false;
    }
  }, "must be an absolute http or https url");

const CreateBody = z.object({
  url: Url,
  title: z.string().trim().min(1).max(500).optional(),
  note: z.string().max(10000).nullable().optional(),
});

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  note: z.string().max(10000).nullable().optional(),
});

const err = (description: string) => ({ description, content: { "application/json": { schema: ErrorSchema } } });

const createRouteDef = createRoute({
  method: "post",
  path: "/bookmarks",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireJson],
  request: { body: { required: true, content: { "application/json": { schema: CreateBody } } } },
  responses: {
    201: { description: "Bookmark saved", content: { "application/json": { schema: BookmarkSchema } } },
    400: err("Validation error"),
    401: err("Missing or invalid token"),
    429: rateLimitedResponse,
    409: err("Url already saved"),
    500: err("Unexpected error"),
  },
});

const getRouteDef = createRoute({
  method: "get",
  path: "/bookmarks/{id}",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The bookmark", content: { "application/json": { schema: BookmarkSchema } } },
    401: err("Missing or invalid token"),
    429: rateLimitedResponse,
    404: err("Not found"),
    500: err("Unexpected error"),
  },
});

const listRouteDef = createRoute({
  method: "get",
  path: "/bookmarks",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { query: z.object({ limit: LimitSchema, cursor: z.string().optional() }) },
  responses: {
    200: {
      description: "A page of bookmarks, newest first",
      content: {
        "application/json": {
          schema: z.object({ items: z.array(BookmarkSchema), next_cursor: z.string().nullable() }),
        },
      },
    },
    400: err("Validation error or invalid cursor"),
    401: err("Missing or invalid token"),
    429: rateLimitedResponse,
    500: err("Unexpected error"),
  },
});

const updateRouteDef = createRoute({
  method: "patch",
  path: "/bookmarks/{id}",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireJson],
  request: {
    params: z.object({ id: z.string() }),
    body: { required: true, content: { "application/json": { schema: UpdateBody } } },
  },
  responses: {
    200: { description: "The updated bookmark", content: { "application/json": { schema: BookmarkSchema } } },
    400: err("Validation error"),
    401: err("Missing or invalid token"),
    404: err("Not found"),
    500: err("Unexpected error"),
  },
});

const deleteRouteDef = createRoute({
  method: "delete",
  path: "/bookmarks/{id}",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "Bookmark deleted" },
    401: err("Missing or invalid token"),
    404: err("Not found"),
    500: err("Unexpected error"),
  },
});

const readRouteDef = createRoute({
  method: "put",
  path: "/bookmarks/{id}/read",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The bookmark, marked read", content: { "application/json": { schema: BookmarkSchema } } },
    401: err("Missing or invalid token"),
    404: err("Not found"),
    500: err("Unexpected error"),
  },
});

const unreadRouteDef = createRoute({
  method: "delete",
  path: "/bookmarks/{id}/read",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "The bookmark, marked unread", content: { "application/json": { schema: BookmarkSchema } } },
    401: err("Missing or invalid token"),
    404: err("Not found"),
    500: err("Unexpected error"),
  },
});

export const bookmarks = new OpenAPIHono<{ Variables: { userId: string; tokenId: string } }>({
  defaultHook: validationHook,
}).openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const created = await createBookmark(c.var.userId, body);
  if (!created) {
    const existingId = await findBookmarkIdByUrl(c.var.userId, body.url);
    if (!existingId) return apiError(c, 500, "internal_error", "Internal server error");
    return apiError(c, 409, "duplicate_url", "You already saved this url", { existing_id: existingId });
  }
  return c.json(created, 201);
}).openapi(getRouteDef, async (c) => {
  const found = await getBookmark(c.var.userId, c.req.valid("param").id);
  if (!found) return apiError(c, 404, "not_found", "Bookmark not found");
  return c.json(found, 200);
}).openapi(listRouteDef, async (c) => {
  const { limit, cursor } = c.req.valid("query");
  const decoded = cursor === undefined ? null : decodeCursor(cursor);
  if (cursor !== undefined && !decoded) return apiError(c, 400, "invalid_cursor", "cursor: not a valid cursor");
  return c.json(await listBookmarks(c.var.userId, limit ?? 20, decoded), 200);
}).openapi(updateRouteDef, async (c) => {
  const updated = await updateBookmark(c.var.userId, c.req.valid("param").id, c.req.valid("json"));
  if (!updated) return apiError(c, 404, "not_found", "Bookmark not found");
  return c.json(updated, 200);
}).openapi(deleteRouteDef, async (c) => {
  if (!(await deleteBookmark(c.var.userId, c.req.valid("param").id))) return apiError(c, 404, "not_found", "Bookmark not found");
  return c.body(null, 204);
}).openapi(readRouteDef, async (c) => {
  const marked = await markBookmarkRead(c.var.userId, c.req.valid("param").id);
  if (!marked) return apiError(c, 404, "not_found", "Bookmark not found");
  return c.json(marked, 200);
}).openapi(unreadRouteDef, async (c) => {
  const marked = await markBookmarkUnread(c.var.userId, c.req.valid("param").id);
  if (!marked) return apiError(c, 404, "not_found", "Bookmark not found");
  return c.json(marked, 200);
});
