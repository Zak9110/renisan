import path from "node:path";
import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { env } from "@/lib/env";
import { importVerifiedCutoffsFromDir } from "@/lib/admissions/import-verified";

async function main() {
  const url = env().DATABASE_URL;
  const { db, close } = createDb(url);
  await runMigrations(db, url);
  const dataDir = path.resolve(process.cwd(), "../renisan/public/data");
  const stats = await importVerifiedCutoffsFromDir(db, dataDir);
  console.log(
    `Imported verified cutoffs: ${stats.universitiesCreated} new universities, ${stats.departmentsUpserted} departments upserted, ${stats.cutoffsUpserted} cutoff rows upserted.`,
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
