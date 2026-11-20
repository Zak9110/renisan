import { defineConfig } from "drizzle-kit";

// Only schema.ts is migrated. Phase 2 tables live in schema-phase2.ts and are
// deliberately left out until the Phase 1 acceptance review is signed off.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
});
