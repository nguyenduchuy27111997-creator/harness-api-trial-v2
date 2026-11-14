import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "coverage", "drizzle", ".drift", ".dependency-cruiser.cjs", "harness"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
