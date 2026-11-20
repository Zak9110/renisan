import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Both drivers share PgDatabase, so services can be written once against this type.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * DATABASE_URL forms:
 *   postgres://...        real Postgres (preview, production)
 *   pglite://memory       in-memory Postgres (tests, e2e)
 *   pglite://./.pglite    file-backed Postgres for local dev without installing Postgres
 */
export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  if (url.startsWith("pglite://")) {
    const target = url.slice("pglite://".length);
    // Options-object form: the (dataDir, options) form silently ignores extensions when dataDir is undefined.
    const client = new PGlite({
      ...(target === "memory" ? {} : { dataDir: target }),
      extensions: { pg_trgm, unaccent },
    });
    return { db: drizzlePglite(client, { schema }) as unknown as Db, close: () => client.close() };
  }
  const client = postgres(url, { max: 5 });
  return { db: drizzlePg(client, { schema }) as unknown as Db, close: () => client.end() };
}
