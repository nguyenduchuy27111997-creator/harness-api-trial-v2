import { OpenAPIHono } from "@hono/zod-openapi";
import { onError } from "./lib/errors.js";
import { auth } from "./routes/auth.js";
import { health } from "./routes/health.js";
import { me } from "./routes/me.js";

// Every route is declared with createRoute and zod schemas, so the contract
// (openapi.json, served at /openapi.json) is generated from the code.
export const app = new OpenAPIHono();
app.route("/", health);
app.route("/", auth);
app.route("/", me);
app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", { type: "http", scheme: "bearer" });
app.onError(onError);

export const openapi = () =>
  app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "marklist", version: "0.1.0" } });

app.get("/openapi.json", (c) => c.json(openapi()));
