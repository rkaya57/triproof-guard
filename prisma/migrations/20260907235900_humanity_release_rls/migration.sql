-- Humanity abuse-control tables are server-only. Keep them inaccessible through
-- Supabase/PostgREST while allowing the trusted server database role to operate
-- as table owner / BYPASSRLS role. Do not FORCE RLS here.

ALTER TABLE "HumanityAbuseBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanitySessionLifecycleEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "HumanityAbuseBucket" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "HumanitySessionLifecycleEvent" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "HumanityAbuseBucket" FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "HumanitySessionLifecycleEvent" FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "HumanityAbuseBucket" FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "HumanitySessionLifecycleEvent" FROM authenticated';
  END IF;
END $$;

COMMENT ON TABLE "HumanityAbuseBucket" IS
  'Server-only Humanity rate-limit buckets. RLS enabled; no PostgREST role access.';
COMMENT ON TABLE "HumanitySessionLifecycleEvent" IS
  'Server-only Humanity lifecycle audit events. RLS enabled; no PostgREST role access.';
