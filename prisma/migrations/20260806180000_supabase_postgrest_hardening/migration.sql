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
        'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
        target_role
      );

      -- Remove both global and public-schema defaults. PostgreSQL combines
      -- global default privileges with schema-specific additions, so a revoke
      -- limited to IN SCHEMA public cannot neutralize a global grant.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM %I',
        current_user,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
        current_user,
        target_role
      );
    END IF;
  END LOOP;

  -- PostgreSQL grants EXECUTE on new functions to PUBLIC by default at the
  -- global owner-default level. Revoke it globally as well as for public so a
  -- future function cannot silently become a PostgREST RPC endpoint.
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
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
