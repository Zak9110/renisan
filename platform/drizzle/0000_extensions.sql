-- Search extensions (see docs/ARCHITECTURE.md). Must run before the schema migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
