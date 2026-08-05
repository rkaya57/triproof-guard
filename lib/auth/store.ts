import { randomBytes, randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"

export type AuthUserRecord = {
  id: string
  name: string
  email: string
  passwordHash: string
  emailVerifiedAt: Date | null
  sessionVersion: number
  onboardingCompletedAt: Date | null
  referralCode: string | null
  createdAt: Date
}

export type PublicAuthUser = Omit<AuthUserRecord, "passwordHash">

const authUserSelect = Prisma.sql`
  SELECT
    "id",
    "name",
    "email",
    "passwordHash",
    "emailVerifiedAt",
    "sessionVersion",
    "onboardingCompletedAt",
    "referralCode",
    "createdAt"
  FROM "User"
`

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase()
}

export function createReferralCode() {
  return randomBytes(6).toString("base64url").toUpperCase()
}

export async function findAuthUserByEmail(email: string) {
  const rows = await db.$queryRaw<AuthUserRecord[]>(
    Prisma.sql`${authUserSelect} WHERE "email" = ${normalizeAuthEmail(email)} LIMIT 1`
  )
  return rows[0] ?? null
}

export async function findAuthUserById(userId: string) {
  const rows = await db.$queryRaw<AuthUserRecord[]>(
    Prisma.sql`${authUserSelect} WHERE "id" = ${userId} LIMIT 1`
  )
  return rows[0] ?? null
}

export async function findUserIdByReferralCode(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase()
  if (!normalized) return null
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "User"
      WHERE "referralCode" = ${normalized}
      LIMIT 1
    `
  )
  return rows[0]?.id ?? null
}

export async function ensureUserReferralCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createReferralCode()
    const updated = await db.$executeRaw(
      Prisma.sql`
        UPDATE "User"
        SET "referralCode" = ${code}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${userId} AND "referralCode" IS NULL
      `
    ).catch(() => 0)
    if (updated > 0) return code

    const rows = await db.$queryRaw<Array<{ referralCode: string | null }>>(
      Prisma.sql`SELECT "referralCode" FROM "User" WHERE "id" = ${userId} LIMIT 1`
    )
    if (rows[0]?.referralCode) return rows[0].referralCode
  }
  throw new Error("Could not allocate a referral code.")
}

export async function createAuthUser(input: {
  name: string
  email: string
  passwordHash: string
  termsAcceptedAt: Date
  privacyAcceptedAt: Date
  emailVerifiedAt: Date | null
  referredByUserId?: string | null
}) {
  const user = await db.user.create({
    data: {
      name: input.name.trim(),
      email: normalizeAuthEmail(input.email),
      passwordHash: input.passwordHash,
    },
    select: { id: true },
  })

  await db.$executeRaw(
    Prisma.sql`
      UPDATE "User"
      SET
        "termsAcceptedAt" = ${input.termsAcceptedAt},
        "privacyAcceptedAt" = ${input.privacyAcceptedAt},
        "emailVerifiedAt" = ${input.emailVerifiedAt},
        "referredByUserId" = ${input.referredByUserId ?? null},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${user.id}
    `
  )
  await ensureUserReferralCode(user.id)
  return findAuthUserById(user.id)
}

export async function markEmailVerified(userId: string) {
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "User"
      SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", CURRENT_TIMESTAMP),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${userId}
    `
  )
  return findAuthUserById(userId)
}

export async function updatePasswordAndRevokeSessions(userId: string, passwordHash: string) {
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } })
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "User"
        SET "sessionVersion" = "sessionVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${userId}
      `
    )
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "AuthSession"
        SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
        WHERE "userId" = ${userId} AND "revokedAt" IS NULL
      `
    )
  })
}

export async function completeUserOnboarding(input: {
  userId: string
  accountRole: string
  primaryUseCase: string
  projectName?: string
  projectWebsite?: string
  xHandle?: string
  telegramHandle?: string
}) {
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "User"
      SET
        "accountRole" = ${input.accountRole},
        "primaryUseCase" = ${input.primaryUseCase},
        "profileProjectName" = ${input.projectName?.trim() || null},
        "profileProjectWebsite" = ${input.projectWebsite?.trim() || null},
        "profileXHandle" = ${input.xHandle?.trim() || null},
        "profileTelegramHandle" = ${input.telegramHandle?.trim() || null},
        "onboardingCompletedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.userId}
    `
  )
}

export async function getUserAccountProfile(userId: string) {
  const rows = await db.$queryRaw<
    Array<{
      id: string
      name: string
      email: string
      emailVerifiedAt: Date | null
      onboardingCompletedAt: Date | null
      accountRole: string | null
      primaryUseCase: string | null
      projectName: string | null
      projectWebsite: string | null
      xHandle: string | null
      telegramHandle: string | null
      referralCode: string | null
    }>
  >(
    Prisma.sql`
      SELECT
        "id", "name", "email", "emailVerifiedAt", "onboardingCompletedAt",
        "accountRole", "primaryUseCase",
        "profileProjectName" AS "projectName",
        "profileProjectWebsite" AS "projectWebsite",
        "profileXHandle" AS "xHandle",
        "profileTelegramHandle" AS "telegramHandle",
        "referralCode"
      FROM "User"
      WHERE "id" = ${userId}
      LIMIT 1
    `
  )
  return rows[0] ?? null
}

export async function createAuthToken(input: {
  userId?: string | null
  type: string
  tokenHash: string
  expiresAt: Date
  metadata?: Record<string, unknown> | null
}) {
  const id = randomUUID()
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "AuthToken" (
        "id", "userId", "type", "tokenHash", "metadata", "expiresAt", "createdAt"
      ) VALUES (
        ${id}, ${input.userId ?? null}, ${input.type}, ${input.tokenHash},
        ${metadata}::jsonb, ${input.expiresAt}, CURRENT_TIMESTAMP
      )
    `
  )
  return id
}

export async function consumeAuthToken(input: {
  tokenHash: string
  type: string
  maxAttempts?: number
}) {
  const maxAttempts = input.maxAttempts ?? 8
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string
        userId: string | null
        metadata: Record<string, unknown> | null
        attempts: number
        expiresAt: Date
        usedAt: Date | null
      }>
    >(
      Prisma.sql`
        SELECT "id", "userId", "metadata", "attempts", "expiresAt", "usedAt"
        FROM "AuthToken"
        WHERE "tokenHash" = ${input.tokenHash} AND "type" = ${input.type}
        FOR UPDATE
      `
    )
    const token = rows[0]
    if (!token || token.usedAt || token.expiresAt <= new Date() || token.attempts >= maxAttempts) {
      return null
    }

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "AuthToken"
        SET "attempts" = "attempts" + 1, "usedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${token.id}
      `
    )
    return token
  })
}

export async function revokeActiveTokens(userId: string, type: string) {
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "AuthToken"
      SET "usedAt" = COALESCE("usedAt", CURRENT_TIMESTAMP)
      WHERE "userId" = ${userId} AND "type" = ${type} AND "usedAt" IS NULL
    `
  )
}

export async function createAuthSession(input: {
  userId: string
  sessionVersion: number
  ipHash?: string | null
  userAgent?: string | null
  expiresAt: Date
}) {
  const id = randomUUID()
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "AuthSession" (
        "id", "userId", "sessionVersion", "ipHash", "userAgent", "expiresAt",
        "createdAt", "lastSeenAt"
      ) VALUES (
        ${id}, ${input.userId}, ${input.sessionVersion}, ${input.ipHash ?? null},
        ${input.userAgent?.slice(0, 500) ?? null}, ${input.expiresAt},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `
  )
  return id
}

export async function getActiveAuthSession(input: {
  sessionId: string
  userId: string
  sessionVersion: number
}) {
  const rows = await db.$queryRaw<Array<{ id: string; lastSeenAt: Date }>>(
    Prisma.sql`
      SELECT "id", "lastSeenAt"
      FROM "AuthSession"
      WHERE "id" = ${input.sessionId}
        AND "userId" = ${input.userId}
        AND "sessionVersion" = ${input.sessionVersion}
        AND "revokedAt" IS NULL
        AND "expiresAt" > CURRENT_TIMESTAMP
      LIMIT 1
    `
  )
  const session = rows[0]
  if (!session) return null
  if (session.lastSeenAt.getTime() < Date.now() - 15 * 60 * 1000) {
    void db.$executeRaw(
      Prisma.sql`
        UPDATE "AuthSession" SET "lastSeenAt" = CURRENT_TIMESTAMP WHERE "id" = ${input.sessionId}
      `
    ).catch(() => undefined)
  }
  return session
}

export async function revokeAuthSession(sessionId: string, userId?: string) {
  await db.$executeRaw(
    userId
      ? Prisma.sql`
          UPDATE "AuthSession"
          SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
          WHERE "id" = ${sessionId} AND "userId" = ${userId}
        `
      : Prisma.sql`
          UPDATE "AuthSession"
          SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
          WHERE "id" = ${sessionId}
        `
  )
}

export async function revokeAllAuthSessions(userId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "User"
        SET "sessionVersion" = "sessionVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${userId}
      `
    )
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "AuthSession"
        SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP)
        WHERE "userId" = ${userId} AND "revokedAt" IS NULL
      `
    )
  })
}

export async function listAuthSessions(userId: string, currentSessionId?: string | null) {
  const rows = await db.$queryRaw<
    Array<{
      id: string
      userAgent: string | null
      createdAt: Date
      lastSeenAt: Date
      expiresAt: Date
      current: boolean
    }>
  >(
    Prisma.sql`
      SELECT
        "id", "userAgent", "createdAt", "lastSeenAt", "expiresAt",
        ("id" = ${currentSessionId ?? ""}) AS "current"
      FROM "AuthSession"
      WHERE "userId" = ${userId}
        AND "revokedAt" IS NULL
        AND "expiresAt" > CURRENT_TIMESTAMP
      ORDER BY "lastSeenAt" DESC
      LIMIT 20
    `
  )
  return rows
}

export async function upsertExternalAccount(input: {
  userId: string
  provider: string
  providerAccountId: string
  email?: string | null
}) {
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "AuthExternalAccount" (
        "id", "userId", "provider", "providerAccountId", "email", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${input.userId}, ${input.provider}, ${input.providerAccountId},
        ${input.email ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("provider", "providerAccountId") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "email" = EXCLUDED."email",
        "updatedAt" = CURRENT_TIMESTAMP
    `
  )
}

export async function findUserByExternalAccount(provider: string, providerAccountId: string) {
  const rows = await db.$queryRaw<Array<{ userId: string }>>(
    Prisma.sql`
      SELECT "userId"
      FROM "AuthExternalAccount"
      WHERE "provider" = ${provider} AND "providerAccountId" = ${providerAccountId}
      LIMIT 1
    `
  )
  return rows[0]?.userId ?? null
}

export async function linkAuthWallet(input: { userId: string; chain: string; address: string }) {
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "AuthWallet" ("id", "userId", "chain", "address", "createdAt", "lastUsedAt")
      VALUES (${randomUUID()}, ${input.userId}, ${input.chain}, ${input.address}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("chain", "address") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "lastUsedAt" = CURRENT_TIMESTAMP
    `
  )
}

export async function findUserByAuthWallet(chain: string, address: string) {
  const rows = await db.$queryRaw<Array<{ userId: string }>>(
    Prisma.sql`
      SELECT "userId"
      FROM "AuthWallet"
      WHERE "chain" = ${chain} AND "address" = ${address}
      LIMIT 1
    `
  )
  return rows[0]?.userId ?? null
}

export async function listAuthWallets(userId: string) {
  return db.$queryRaw<Array<{ id: string; chain: string; address: string; createdAt: Date; lastUsedAt: Date | null }>>(
    Prisma.sql`
      SELECT "id", "chain", "address", "createdAt", "lastUsedAt"
      FROM "AuthWallet"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
    `
  )
}
