import { readdirSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const shouldRun =
  process.env.VERCEL === "1" &&
  process.env.VERCEL_ENV === "production" &&
  Boolean(process.env.DATABASE_URL)

if (!shouldRun) {
  console.log("Skipping Prisma migrate deploy outside Vercel production build.")
  process.exit(0)
}

const runPrisma = (args, options = {}) =>
  spawnSync("npx", ["prisma", ...args], {
    stdio: options.capture ? "pipe" : options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: process.platform === "win32",
    env: process.env,
    encoding: "utf8",
    input: options.input,
  })

const runDeploy = (options = {}) => runPrisma(["migrate", "deploy"], options)

function verifyPostgrestHardening() {
  console.log("Verifying Supabase PostgREST deny-by-default controls...")
  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts", "verify-postgrest-hardening.mjs")],
    {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    }
  )
  if (result.status !== 0) {
    console.error("PostgREST hardening verification failed after migration deploy.")
    process.exit(result.status ?? 1)
  }
}

function finishSuccessfulDeploy() {
  verifyPostgrestHardening()
  process.exit(0)
}

const scamGuardIntelligenceRepairSql = String.raw`
DO $$
BEGIN
  CREATE TYPE "ScamGuardIntelKind" AS ENUM ('DOMAIN', 'WALLET', 'EVM_ADDRESS', 'SOLANA_ADDRESS', 'TOKEN', 'CONTRACT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ScamGuardIntelVerdict" AS ENUM ('TRUSTED', 'SUSPICIOUS', 'KNOWN_BAD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ScamGuardIntelEntry" (
    "id" TEXT NOT NULL,
    "kind" "ScamGuardIntelKind" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT '',
    "verdict" "ScamGuardIntelVerdict" NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScamGuardIntelEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScamGuardIntelEntry_kind_normalized_chain_key" ON "ScamGuardIntelEntry"("kind", "normalized", "chain");
CREATE INDEX IF NOT EXISTS "ScamGuardIntelEntry_kind_normalized_idx" ON "ScamGuardIntelEntry"("kind", "normalized");
CREATE INDEX IF NOT EXISTS "ScamGuardIntelEntry_verdict_active_idx" ON "ScamGuardIntelEntry"("verdict", "active");
CREATE INDEX IF NOT EXISTS "ScamGuardIntelEntry_createdById_idx" ON "ScamGuardIntelEntry"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ScamGuardIntelEntry_createdById_fkey'
  ) THEN
    ALTER TABLE "ScamGuardIntelEntry"
      ADD CONSTRAINT "ScamGuardIntelEntry_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
`

function repairKnownFailedMigration(output) {
  const migration = "20260727090000_scamguard_intelligence"
  if (!output.includes("P3009") || !output.includes(migration)) return false

  console.log(`Detected failed ${migration}. Repairing idempotent database objects before marking it applied...`)
  const repair = runPrisma(["db", "execute", "--stdin"], {
    input: scamGuardIntelligenceRepairSql,
  })
  if (repair.status !== 0) {
    console.error(`Failed to repair ${migration}.`)
    process.exit(repair.status ?? 1)
  }

  const resolve = runPrisma(["migrate", "resolve", "--applied", migration])
  if (resolve.status !== 0) {
    console.error(`Failed to mark ${migration} as applied after repair.`)
    process.exit(resolve.status ?? 1)
  }

  return true
}

console.log("Running Prisma migrate deploy for Vercel production build...")
let result = runDeploy({ capture: true })

if (result.status === 0) {
  process.stdout.write(result.stdout ?? "")
  process.stderr.write(result.stderr ?? "")
  finishSuccessfulDeploy()
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
process.stdout.write(result.stdout ?? "")
process.stderr.write(result.stderr ?? "")

if (repairKnownFailedMigration(output)) {
  console.log("Repair complete. Re-running Prisma migrate deploy...")
  result = runDeploy()
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  finishSuccessfulDeploy()
}

if (!output.includes("P3005")) {
  process.exit(result.status ?? 1)
}

const baselineBefore = process.env.PRISMA_BASELINE_BEFORE_MIGRATION ?? "20260715120000_airdrop_tasks"
const migrationsDir = join(process.cwd(), "prisma", "migrations")
const baselineMigrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => name < baselineBefore)
  .sort()

if (baselineMigrations.length === 0) {
  console.error(`P3005 detected, but no migrations were found before ${baselineBefore}.`)
  process.exit(result.status ?? 1)
}

console.log(
  `Prisma migration history is missing on a non-empty production database. Baseline-marking ${baselineMigrations.length} existing migrations before ${baselineBefore}...`,
)

for (const migration of baselineMigrations) {
  const resolveResult = runPrisma(["migrate", "resolve", "--applied", migration])
  if (resolveResult.status !== 0) {
    process.exit(resolveResult.status ?? 1)
  }
}

console.log("Baseline complete. Re-running Prisma migrate deploy...")
result = runDeploy()

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

finishSuccessfulDeploy()
