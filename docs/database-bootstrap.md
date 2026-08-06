# Database bootstrap and migration policy

Tri-Proof has two database lifecycle paths. They must not be mixed.

## Existing environments

Any environment that already contains Prisma migration history must use:

```bash
npm run db:deploy
```

This runs the normal `prisma migrate deploy` command. It does not rewrite historical migrations, reset the schema, or baseline existing tables.

The Vercel production build continues to use this migration path.

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
4. Records every historical migration as an explicit Prisma baseline with `prisma migrate resolve --applied`.
5. Runs `prisma migrate deploy` to prove that no migration remains pending.
6. Verifies authentication columns, tables, indexes, foreign keys, row-level security, migration records, and runtime SQL query shapes.

After the first successful bootstrap, use only `npm run db:deploy` for that database.

## Safety guard

The bootstrap refuses to continue when a `User` table exists but `_prisma_migrations` does not. That state may represent an untracked production or legacy database. It must be backed up and reviewed manually; the script intentionally provides no force flag.

Never delete `_prisma_migrations`, run `prisma migrate reset`, or edit the checksum of a migration that has already been applied in production.

## Verification only

To validate an already bootstrapped database without changing it:

```bash
npm run db:verify-auth-schema
```

The verification transaction creates temporary authentication records and rolls them back. It does not retain test users, sessions, tokens, wallets, or security events.

## CI contract

The clean-database workflow provisions PostgreSQL 17 from scratch and must pass all of the following before this baseline path is considered safe:

- guarded bootstrap
- authentication schema verification
- Prisma migration status
- TypeScript
- lint
- full unit and regression tests
- production Next.js build
