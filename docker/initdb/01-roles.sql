-- Runs ONCE as the compose superuser on an EMPTY volume. Later edits are silently
-- ignored until `pnpm stack:nuke`. Same script runs once via psql on managed PG.
-- DEV-ONLY passwords. Keep POS_PG_DB=nukes_pos or edit this file.

-- Migration/DDL owner. NOT superuser. Owns schema + tables (RLS-exempt as owner: the
-- sanctioned bypass channel for migrations/seeds — never grant BYPASSRLS, never FORCE RLS).
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_owner') THEN
    CREATE ROLE pos_owner LOGIN PASSWORD 'pos_owner' NOSUPERUSER NOCREATEROLE NOCREATEDB;
  END IF;
END $$;

-- Runtime role. Subject to RLS. DATABASE_URL uses this one.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_app') THEN
    CREATE ROLE pos_app LOGIN PASSWORD 'pos_app'
      NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
  END IF;
END $$;

ALTER DATABASE nukes_pos OWNER TO pos_owner;
GRANT CONNECT ON DATABASE nukes_pos TO pos_app;

-- Second database for vitest integration / playwright — same container.
CREATE DATABASE nukes_pos_test OWNER pos_owner;
GRANT CONNECT ON DATABASE nukes_pos_test TO pos_app;

\connect nukes_pos
ALTER SCHEMA public OWNER TO pos_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pos_app;
-- Without DEFAULT PRIVILEGES every future migration-created table 403s for pos_app (verified).
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pos_app;

\connect nukes_pos_test
ALTER SCHEMA public OWNER TO pos_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pos_app;
