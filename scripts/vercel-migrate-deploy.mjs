import { spawnSync } from "node:child_process"

const shouldRun =
  process.env.VERCEL === "1" &&
  process.env.VERCEL_ENV === "production" &&
  Boolean(process.env.DATABASE_URL)

if (!shouldRun) {
  console.log("Skipping Prisma migrate deploy outside Vercel production build.")
  process.exit(0)
}

console.log("Running Prisma migrate deploy for Vercel production build...")
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
