import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { createDb, type Db } from "./client";

export const MIGRATIONS_FOLDER = new URL("../../drizzle", import.meta.url).pathname;

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
