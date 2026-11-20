import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { env } from "@/lib/env";

interface GlobalDbState {
  __renisanDb?: Db;
  __renisanReady?: Promise<Db>;
}

const g = globalThis as unknown as GlobalDbState;

/**
 * Returns the shared Drizzle database instance. For local PGlite databases,
 * applies Drizzle migrations automatically on first use.
 */
export async function getDb(): Promise<Db> {
  if (g.__renisanDb) return g.__renisanDb;
  if (!g.__renisanReady) {
    g.__renisanReady = (async () => {
      const url = env().DATABASE_URL;
      const { db } = createDb(url);
      if (url.startsWith("pglite://")) {
        await runMigrations(db, url);
      }
      g.__renisanDb = db;
      return db;
    })();
  }
  return g.__renisanReady;
}
