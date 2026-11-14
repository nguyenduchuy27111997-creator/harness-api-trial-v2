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
    if (/\{(id|name)\}/.test(path)) expectError(label, op, 404);
    if (op.requestBody || op.parameters?.some((p) => p.in === "query")) expectError(label, op, 400);
  }
});

test("conflicts are documented", () => {
  expectError("POST /bookmarks", doc.paths["/bookmarks"]!.post!, 409);
  const props = doc.paths["/bookmarks"]!.post!.responses[409]!.content!["application/json"]!.schema!.properties!.error!.properties!;
  expect(props.existing_id).toBeDefined();
  expectError("POST /auth/sign-up", doc.paths["/auth/sign-up"]!.post!, 409);
});

// F111: M2 routes and rate limits.
test("every M2 route is listed", () => {
  const listed = ops.map((o) => o.label);
  for (const r of ["PUT /bookmarks/{id}/tags/{tag}", "DELETE /bookmarks/{id}/tags/{tag}", "GET /tags", "PATCH /tags/{name}"]) {
    expect(listed).toContain(r);
  }
});

test("every rate-limited route documents 429 with Retry-After", () => {
  const unlimited = ["GET /health", "POST /auth/sign-up"];
  for (const { label, op } of ops) {
    if (unlimited.includes(label)) {
      expect(op.responses[429], `${label} has no 429`).toBeUndefined();
      continue;
    }
    expectError(label, op, 429);
    const headers = (op.responses[429] as Res & { headers?: Record<string, unknown> }).headers;
    expect(headers?.["Retry-After"], `${label} 429 documents Retry-After`).toBeDefined();
  }
});

test("GET /bookmarks documents the tag, status and q query params", () => {
  const names = (doc.paths["/bookmarks"]!.get!.parameters as { in: string; name: string }[])
    .filter((p) => p.in === "query").map((p) => p.name);
  for (const n of ["tag", "status", "q"]) expect(names).toContain(n);
});
