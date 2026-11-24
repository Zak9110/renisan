// CLI importer: loads verified records from ../renisan/public/data/scholarships.json
// into the platform Postgres/PGlite database (estimated dates land in `in_review` per Hard Rule 2).
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { users } from "./schema";
import {
  importVerifiedScholarships,
  type LegacyScholarshipRecord,
} from "@/lib/opportunities/import-verified";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const jsonPath = path.resolve(process.cwd(), "../renisan/public/data/scholarships.json");
  const records = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as LegacyScholarshipRecord[];

  const { db, close } = createDb(url);
  await runMigrations(db, url);

  let [editor] = await db.select().from(users).where(eq(users.role, "editor")).limit(1);
  if (!editor) {
    const [created] = await db
      .insert(users)
      .values({ email: "editor@renisan.local", role: "editor", locale: "en" })
      .returning();
    editor = created!;
  }

  const res = await importVerifiedScholarships(db, records, editor.id);
  await close();
  console.log(`Imported ${res.imported} verified scholarships (${res.skipped} already present).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
