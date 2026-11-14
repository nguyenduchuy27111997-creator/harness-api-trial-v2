import { Ajv2020 } from "ajv/dist/2020.js";
import { expect } from "vitest";
import doc from "../openapi.json" with { type: "json" };
import { app } from "../src/app.js";

// Calls the API in-process and checks the response against the committed contract
// (openapi.json): the status must be documented and the body must match its schema.
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(doc, "openapi.json");

type Method = "get" | "post" | "put" | "patch" | "delete";
type Responses = Record<string, { content?: Record<string, unknown> }>;
const paths = doc.paths as Record<string, Partial<Record<Method, { responses?: Responses }>>>;

// `token` sends `Authorization: Bearer <token>`; `query` and `headers` are added as given.
export async function call(method: Method, path: string, opts: {
  params?: Record<string, string>; query?: Record<string, string>; body?: unknown; token?: string; headers?: Record<string, string>;
} = {}) {
  const url = path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(opts.params?.[k] ?? ""))
    + (opts.query ? `?${new URLSearchParams(opts.query)}` : "");
  const res = await app.request(url, {
    method: method.toUpperCase(),
    headers: {
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  const pointer = `/paths/${path.replace(/~/g, "~0").replace(/\//g, "~1")}/${method}/responses/${res.status}`;
  const documented = paths[path]?.[method]?.responses?.[res.status];
  expect(documented, `${method.toUpperCase()} ${path} returned ${res.status}, which openapi.json does not document`).toBeTruthy();
  if (documented?.content?.["application/json"]) {
    const validate = ajv.getSchema(`openapi.json#${pointer}/content/application~1json/schema`)!;
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  }
  return { status: res.status, body, headers: res.headers };
}
