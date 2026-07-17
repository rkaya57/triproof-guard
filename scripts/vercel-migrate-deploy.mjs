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
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
    env: process.env,
    encoding: "utf8",
  })

const runDeploy = (options = {}) => runPrisma(["migrate", "deploy"], options)

console.log("Running Prisma migrate deploy for Vercel production build...")
let result = runDeploy({ capture: true })

if (result.status === 0) {
  process.stdout.write(result.stdout ?? "")
  process.stderr.write(result.stderr ?? "")
  process.exit(0)
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
process.stdout.write(result.stdout ?? "")
process.stderr.write(result.stderr ?? "")

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
