import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Hard rule 9: never log PII, OTPs or tokens. Use the scrubbing logger (M1) instead.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/db/seed.ts", "src/db/migrate.ts"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
