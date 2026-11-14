import { expect, test } from "vitest";
import { app, openapi } from "../src/app.js";

// Fails when a route is added without its error responses (F015). Reads the live document,
// which test/openapi.test.ts keeps equal to the committed openapi.json.
type Res = { content?: Record<string, { schema?: Schema }> };
type Schema = { required?: string[]; properties?: Record<string, Schema & { type?: string }> };
type Op = { security?: unknown[]; requestBody?: unknown; parameters?: { in: string }[]; responses: Record<string, Res> };
const doc = openapi() as unknown as { paths: Record<string, Record<string, Op>> };
const ops = Object.entries(doc.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({ label: `${method.toUpperCase()} ${path}`, path, op })),
);

const isErrorSchema = (res?: Res) => {
  const s = res?.content?.["application/json"]?.schema;
  const e = s?.properties?.error;
  return Boolean(s?.required?.includes("error")) && e?.properties?.code?.type === "string" && e?.properties?.message?.type === "string";
};
const expectError = (label: string, op: Op, status: number) => {
  expect(op.responses[status], `${label} documents ${status}`).toBeDefined();
  expect(isErrorSchema(op.responses[status]), `${label} ${status} uses {error: {code, message}}`).toBe(true);
};

test("every M1 route is listed", () => {
  const listed = ops.map((o) => o.label).sort();
  const registered = app.routes.filter((r) => r.method !== "ALL" && r.path !== "/openapi.json")
    .map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, "{$1}")}`);
  for (const r of new Set(registered)) expect(listed, r).toContain(r);
  for (const r of ["POST /auth/sign-up", "POST /auth/sign-in", "POST /auth/sign-out", "GET /me", "POST /bookmarks",
    "GET /bookmarks", "GET /bookmarks/{id}", "PATCH /bookmarks/{id}", "DELETE /bookmarks/{id}",
    "PUT /bookmarks/{id}/read", "DELETE /bookmarks/{id}/read"]) expect(listed).toContain(r);
});

test("routes document their 401, 404 and 400 error bodies", () => {
  for (const { label, path, op } of ops) {
    if (op.security?.length) expectError(label, op, 401);
    if (path.includes("{id}")) expectError(label, op, 404);
    if (op.requestBody || op.parameters?.some((p) => p.in === "query")) expectError(label, op, 400);
  }
});

test("conflicts are documented", () => {
  expectError("POST /bookmarks", doc.paths["/bookmarks"]!.post!, 409);
  const props = doc.paths["/bookmarks"]!.post!.responses[409]!.content!["application/json"]!.schema!.properties!.error!.properties!;
  expect(props.existing_id).toBeDefined();
  expectError("POST /auth/sign-up", doc.paths["/auth/sign-up"]!.post!, 409);
});
