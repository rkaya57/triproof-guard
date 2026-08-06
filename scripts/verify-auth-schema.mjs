import { randomUUID } from "node:crypto"
import { readdir } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import pg from "pg"

const { Client } = pg
const databaseUrl = process.env.DATABASE_URL?.trim()
const root = process.cwd()
const migrationsPath = path.join(root, "prisma", "migrations")

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for auth schema verification.")
}

const requiredUserColumns = [
  "emailVerifiedAt",
  "termsAcceptedAt",
  "privacyAcceptedAt",
  "sessionVersion",
  "onboardingCompletedAt",
  "accountRole",
  "primaryUseCase",
  "profileProjectName",
  "profileProjectWebsite",
  "profileXHandle",
  "profileTelegramHandle",
  "referralCode",
  "referredByUserId",
]

const requiredAuthTables = [
  "AuthSession",
  "AuthToken",
  "AuthRateLimitBucket",
  "AuthSecurityEvent",
  "AuthExternalAccount",
  "AuthWallet",
]

const requiredIndexes = [
  "User_referralCode_key",
  "User_referredByUserId_idx",
  "AuthSession_userId_revokedAt_expiresAt_idx",
  "AuthSession_expiresAt_idx",
  "AuthToken_tokenHash_key",
  "AuthToken_userId_type_expiresAt_idx",
  "AuthToken_type_expiresAt_idx",
  "AuthRateLimitBucket_expiresAt_idx",
  "AuthSecurityEvent_userId_createdAt_idx",
  "AuthSecurityEvent_type_createdAt_idx",
  "AuthSecurityEvent_ipHash_createdAt_idx",
  "AuthExternalAccount_provider_providerAccountId_key",
  "AuthExternalAccount_userId_idx",
  "AuthWallet_chain_address_key",
  "AuthWallet_userId_idx",
]

const requiredConstraints = [
  "User_referredByUserId_fkey",
  "AuthSession_userId_fkey",
  "AuthToken_userId_fkey",
  "AuthSecurityEvent_userId_fkey",
  "AuthExternalAccount_userId_fkey",
  "AuthWallet_userId_fkey",
]

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

function assertMissing(kind, expected, actual) {
  const missing = expected.filter((value) => !actual.has(value))
  if (missing.length) {
    throw new Error(`Missing ${kind}: ${missing.join(", ")}`)
  }
}

async function migrationNames() {
  const entries = await readdir(migrationsPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function verifyCatalog(client) {
  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User'`
  )
  assertMissing(
    "User auth columns",
    requiredUserColumns,
    new Set(columns.rows.map((row) => row.column_name))
  )

  const tables = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
  )
  assertMissing(
    "auth tables",
    requiredAuthTables,
    new Set(tables.rows.map((row) => row.tablename))
  )

  const indexes = await client.query(
    `SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'public'`
  )
  assertMissing(
    "auth indexes",
    requiredIndexes,
    new Set(indexes.rows.map((row) => row.indexname))
  )

  const constraints = await client.query(`
    SELECT conname
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace
  `)
  assertMissing(
    "auth foreign keys",
    requiredConstraints,
    new Set(constraints.rows.map((row) => row.conname))
  )

  const rls = await client.query(
    `SELECT relname, relrowsecurity FROM pg_catalog.pg_class WHERE relname = ANY($1::text[])`,
    [requiredAuthTables]
  )
  const rlsState = new Map(rls.rows.map((row) => [row.relname, row.relrowsecurity]))
  const rlsDisabled = requiredAuthTables.filter((table) => rlsState.get(table) !== true)
  if (rlsDisabled.length) {
    throw new Error(`Row-level security is not enabled for: ${rlsDisabled.join(", ")}`)
  }

  const expectedMigrations = await migrationNames()
  const migrationRows = await client.query(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `)
  assertMissing(
    "applied migration records",
    expectedMigrations,
    new Set(migrationRows.rows.map((row) => row.migration_name))
  )
}

async function verifyRuntimeQueryShapes(client) {
  const suffix = randomUUID().replaceAll("-", "")
  const userId = randomUUID()
  const sessionId = randomUUID()
  const tokenId = randomUUID()
  const externalId = randomUUID()
  const walletId = randomUUID()
  const eventId = randomUUID()
  const referralCode = `QA${suffix.slice(0, 14).toUpperCase()}`
  const email = `auth-schema-${suffix}@example.test`

  await client.query("BEGIN")
  try {
    await client.query(
      `
        INSERT INTO "User" (
          "id", "name", "email", "passwordHash",
          "emailVerifiedAt", "termsAcceptedAt", "privacyAcceptedAt",
          "sessionVersion", "referralCode", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP, 1, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [userId, "Auth Schema QA", email, "not-a-real-password-hash", referralCode]
    )

    const user = await client.query(
      `
        SELECT "id", "email", "emailVerifiedAt", "sessionVersion",
          "onboardingCompletedAt", "referralCode", "createdAt"
        FROM "User" WHERE "id" = $1
      `,
      [userId]
    )
    if (user.rows[0]?.email !== email || user.rows[0]?.sessionVersion !== 1) {
      throw new Error("Runtime User auth query shape did not round-trip correctly.")
    }

    await client.query(
      `
        INSERT INTO "AuthSession" (
          "id", "userId", "sessionVersion", "ipHash", "userAgent",
          "createdAt", "lastSeenAt", "expiresAt"
        ) VALUES ($1, $2, 1, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + INTERVAL '1 hour')
      `,
      [sessionId, userId, `ip-${suffix}`, "auth-schema-verifier"]
    )

    await client.query(
      `
        INSERT INTO "AuthToken" (
          "id", "userId", "type", "tokenHash", "metadata", "expiresAt", "createdAt"
        ) VALUES ($1, $2, 'EMAIL_VERIFY', $3, $4::jsonb,
          CURRENT_TIMESTAMP + INTERVAL '15 minutes', CURRENT_TIMESTAMP)
      `,
      [tokenId, userId, `token-${suffix}`, JSON.stringify({ source: "schema-verifier" })]
    )

    await client.query(
      `
        INSERT INTO "AuthExternalAccount" (
          "id", "userId", "provider", "providerAccountId", "email", "createdAt", "updatedAt"
        ) VALUES ($1, $2, 'github', $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [externalId, userId, `provider-${suffix}`, email]
    )

    await client.query(
      `
        INSERT INTO "AuthWallet" (
          "id", "userId", "chain", "address", "createdAt", "lastUsedAt"
        ) VALUES ($1, $2, 'solana', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [walletId, userId, `wallet-${suffix}`]
    )

    await client.query(
      `
        INSERT INTO "AuthSecurityEvent" (
          "id", "userId", "type", "success", "ipHash", "identifierHash", "metadata", "createdAt"
        ) VALUES ($1, $2, 'SCHEMA_VERIFY', TRUE, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
      `,
      [eventId, userId, `ip-${suffix}`, `identifier-${suffix}`, JSON.stringify({ verified: true })]
    )

    const bucket = await client.query(
      `
        INSERT INTO "AuthRateLimitBucket" (
          "key", "count", "windowStart", "expiresAt", "updatedAt"
        ) VALUES ($1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 minute', CURRENT_TIMESTAMP)
        ON CONFLICT ("key") DO UPDATE SET "count" = "AuthRateLimitBucket"."count" + 1
        RETURNING "count"
      `,
      [`schema:${suffix}`]
    )
    if (bucket.rows[0]?.count !== 1) {
      throw new Error("Auth rate-limit query shape did not return the expected count.")
    }

    await client.query("ROLLBACK")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  }
}

async function main() {
  const client = new Client(clientOptions())
  await client.connect()
  try {
    await verifyCatalog(client)
    await verifyRuntimeQueryShapes(client)
  } finally {
    await client.end()
  }

  console.log("Authentication schema verification passed.")
}

main().catch((error) => {
  console.error("Authentication schema verification failed:")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
