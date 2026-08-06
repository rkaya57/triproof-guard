import { spawn } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import pg from "pg"

const { Client } = pg
const root = process.cwd()
const migrationsPath = path.join(root, "prisma", "migrations")
const authMigrationName = "20260805171000_professional_auth_hardening"
const authMigrationPath = path.join(migrationsPath, authMigrationName, "migration.sql")
const databaseUrl = process.env.DATABASE_URL?.trim()

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database bootstrap.")
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

function clientOptions() {
  try {
    const parsed = new URL(databaseUrl)
    return {
      connectionString: databaseUrl,
      ssl: isLoopbackHost(parsed.hostname) ? undefined : { rejectUnauthorized: false },
    }
  } catch {
    return { connectionString: databaseUrl }
  }
}

async function withClient(callback) {
  const client = new Client(clientOptions())
  await client.connect()
  try {
    return await callback(client)
  } finally {
    await client.end()
  }
}

async function inspectDatabase() {
  return withClient(async (client) => {
    const result = await client.query(`
      SELECT
        to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable",
        to_regclass('public."User"') IS NOT NULL AS "hasUserTable"
    `)
    return result.rows[0] ?? { hasMigrationTable: false, hasUserTable: false }
  })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    })

    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`
        )
      )
    })
  })
}

async function runPrisma(args) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx"
  await run(executable, ["prisma", ...args])
}

async function migrationNames() {
  const entries = await readdir(migrationsPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function applyAuthHardening() {
  const sql = await readFile(authMigrationPath, "utf8")
  await withClient(async (client) => {
    await client.query("BEGIN")
    try {
      await client.query(sql)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    }
  })
}

async function baselineMigrationHistory(names) {
  for (const name of names) {
    await runPrisma(["migrate", "resolve", "--applied", name])
  }
}

async function verifyBootstrap() {
  const executable = process.platform === "win32" ? "node.exe" : process.execPath
  await run(executable, [path.join("scripts", "verify-auth-schema.mjs")])
}

async function main() {
  const state = await inspectDatabase()

  if (state.hasMigrationTable) {
    console.log("Existing Prisma migration history detected. Running normal migrate deploy only.")
    await runPrisma(["migrate", "deploy"])
    await verifyBootstrap()
    return
  }

  if (state.hasUserTable) {
    throw new Error(
      [
        "Refusing to baseline an existing database without Prisma migration history.",
        "This guard prevents an unknown production schema from being marked as applied.",
        "Create a backup and perform a reviewed manual baseline instead of bypassing this check.",
      ].join(" ")
    )
  }

  console.log("Fresh PostgreSQL database detected. Building the current Prisma schema.")
  await runPrisma(["db", "push"])

  console.log("Applying the idempotent professional authentication schema.")
  await applyAuthHardening()

  const names = await migrationNames()
  if (!names.includes(authMigrationName)) {
    throw new Error(`Required auth migration ${authMigrationName} is missing.`)
  }

  console.log(`Recording ${names.length} historical migrations as an explicit clean-database baseline.`)
  await baselineMigrationHistory(names)

  console.log("Confirming that no migration remains pending.")
  await runPrisma(["migrate", "deploy"])
  await verifyBootstrap()

  console.log("Clean database bootstrap completed successfully.")
}

main().catch((error) => {
  console.error("Database bootstrap failed:")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
