import { defineConfig } from "drizzle-kit";

// Schema in src/db/schema.ts; `npm run db:generate` writes a migration to drizzle/.
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env.test"); } catch { /* CI sets DATABASE_URL */ }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
