-- HumanGuard tables live in the public schema but are server-only persistence.
-- Enable RLS with no PostgREST-facing policies. The Prisma runtime role owns the
-- tables (or bypasses RLS in hosted environments), while anon/authenticated
-- PostgREST roles receive no direct row access.

ALTER TABLE "HumanGuardSite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanGuardChallengeSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HumanGuardProof" ENABLE ROW LEVEL SECURITY;
