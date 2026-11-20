import fs from "node:fs";
import path from "node:path";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { createDb, type Db } from "./client";

function resolveMigrationsFolder(): string {
  const local = path.resolve(process.cwd(), "drizzle");
  if (fs.existsSync(local)) return local;
  return path.resolve(process.cwd(), "platform/drizzle");
}

export const MIGRATIONS_FOLDER = resolveMigrationsFolder();

export async function runMigrations(db: Db, url: string) {
  // The migrators are driver-specific; the runtime object matches the driver chosen by createDb(url).
  if (url.startsWith("pglite://")) {
    await migratePglite(db as unknown as Parameters<typeof migratePglite>[0], {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } else {
    await migratePg(db as unknown as Parameters<typeof migratePg>[0], {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, close } = createDb(url);
  await runMigrations(db, url);
  await close();
  console.log("Migrations applied.");
}
