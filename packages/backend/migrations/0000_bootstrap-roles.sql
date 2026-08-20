-- Custom migration created via `drizzle-kit generate --custom --name=bootstrap-roles`
-- BEFORE the first schema generate so it journals as 0000 (ordering verified).
-- Idempotent: coexists with docker/initdb (which creates pos_app LOGIN); on consumer DBs
-- where initdb never ran, this prevents CREATE POLICY 42704 (live-verified failure).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_app') THEN
    CREATE ROLE pos_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO pos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pos_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
-- Operator creates the LOGIN user and GRANTs pos_app to it; the login user must NOT own
-- the tables (owners bypass RLS) and must never be BYPASSRLS.
