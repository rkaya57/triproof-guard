-- Deny direct PostgREST access to Tri-Proof application tables.
--
-- The application uses the server-side PostgreSQL connection through Prisma.
-- It does not rely on anon/authenticated Supabase table or RPC access. Keep the
-- service_role untouched for reviewed administrative use, and do not FORCE RLS
-- so the database owner / BYPASSRLS runtime role remains operational.

DO $$
DECLARE
  target_role TEXT;
  target_table RECORD;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
        target_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
        target_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I',
        target_role
      );

      -- Prisma migrations run as the database owner. Prevent future tables and
      -- sequences created by that role from silently restoring PostgREST access.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
        current_user,
        target_role
      );
    END IF;
  END LOOP;

  -- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Tri-Proof
  -- has no public PostgREST RPC contract, so functions must be explicitly opened
  -- in a reviewed migration when one is intentionally introduced.
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC',
    current_user
  );

  -- RLS is an independent defense layer. No permissive policies are added for
  -- anon/authenticated. The server-side postgres role owns every application
  -- table and has BYPASSRLS in Supabase, so Prisma remains unaffected.
  FOR target_table IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      target_table.schema_name,
      target_table.table_name
    );
  END LOOP;
END
$$;
