# Database bootstrap and migration policy

Tri-Proof has two database lifecycle paths. They must not be mixed.

## Existing environments

Any environment that already contains Prisma migration history must use:

```bash
npm run db:deploy
```

This runs the normal `prisma migrate deploy` command. It does not rewrite historical migrations, reset the schema, or baseline existing tables.

The Vercel production build continues to use this migration path. After deployment, the production migration script also runs:

```bash
npm run db:verify-postgrest
```

The build must fail if a public application table is missing RLS, if the Supabase `anon` or `authenticated` roles regain table/sequence access, or if a public RPC function becomes executable without an explicit reviewed grant.

## Brand-new PostgreSQL databases

The historical migration directory predates a complete initial migration. Running `prisma migrate deploy` directly against an empty database therefore cannot reconstruct the full schema safely.

Use the guarded bootstrap command once:

```bash
npm run db:bootstrap
```

The bootstrap performs these steps:

1. Confirms that neither `_prisma_migrations` nor the `User` table exists.
2. Builds the current application schema with `prisma db push`.
3. Applies the existing idempotent professional-authentication migration.
4. Applies the Supabase PostgREST deny-by-default migration.
5. Records every historical migration as an explicit Prisma baseline with `prisma migrate resolve --applied`.
6. Runs `prisma migrate deploy` to prove that no migration remains pending.
7. Verifies authentication columns, tables, indexes, foreign keys, row-level security, migration records, PostgREST grants, and runtime SQL query shapes.

After the first successful bootstrap, use only `npm run db:deploy` for that database.

## Supabase PostgREST access policy

Tri-Proof accesses PostgreSQL from the server through Prisma. The product does not expose application tables through the Supabase `anon` or `authenticated` PostgREST roles.

The hardening migration therefore:

- revokes all current table and sequence privileges from `anon` and `authenticated`;
- revokes current public RPC execution from `PUBLIC`, `anon`, and `authenticated`;
- removes unsafe default privileges so future tables, sequences, and functions remain closed;
- enables row-level security on every current ordinary or partitioned table in `public`;
- leaves `service_role` untouched for explicitly reviewed administrative use;
- does not use `FORCE ROW LEVEL SECURITY`, so the server-side database owner / `BYPASSRLS` role remains operational.

Any future migration that creates a table must explicitly enable RLS in the same migration. The production verification step intentionally rejects a newly created public table without RLS, even when its grants are already closed.

Any future PostgREST table or RPC surface must be introduced through a dedicated security-reviewed migration with the narrowest possible grants and RLS policies. Do not grant broad access manually in the Supabase dashboard.

## Safety guard

The bootstrap refuses to continue when a `User` table exists but `_prisma_migrations` does not. That state may represent an untracked production or legacy database. It must be backed up and reviewed manually; the script intentionally provides no force flag.

Never delete `_prisma_migrations`, run `prisma migrate reset`, or edit the checksum of a migration that has already been applied in production.

Before applying a security or permission migration to production:

1. Confirm the current Prisma migration status.
2. Confirm a restorable database backup or PITR recovery point.
3. Run the migration against an isolated PostgreSQL/Supabase-like environment.
4. Verify Prisma runtime CRUD and authentication flows.
5. Keep a monitored rollback and incident owner available.

## Verification only

To validate an already bootstrapped database without retaining data:

```bash
npm run db:verify-auth-schema
npm run db:verify-postgrest
```

Both verification paths use transactions for their temporary runtime records and roll them back. They do not retain test users, sessions, tokens, wallets, or security events.

## CI contract

The clean-database and Supabase PostgREST workflows provision PostgreSQL 17 from scratch and must pass all of the following before the database path is considered safe:

- guarded bootstrap
- authentication schema verification
- Prisma migration status
- simulated Supabase role/grant removal
- `anon` and `authenticated` table/RPC denial
- retained `service_role` administrative access
- future-object default privilege checks
- future RLS regression detection
- server-side Prisma CRUD verification
- TypeScript
- lint
- full unit and regression tests
- production Next.js build
