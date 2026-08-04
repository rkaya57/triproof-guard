import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import {
  ensureTelegramGroup,
  getTelegramGuardianAdminOverview,
  type GuardianAlertLevel,
} from "@/lib/telegram/store"

export type TelegramSafeMode = "SILENT" | "COMPACT" | "FULL"
export type TelegramModerationAction =
  | "WARN_ONLY"
  | "ADMIN_REVIEW"
  | "DELETE"
  | "DELETE_MUTE_1H"
  | "DELETE_MUTE_24H"

export type AdvancedTelegramGroupSettings = {
  id: string
  telegramChatId: string
  title: string | null
  username: string | null
  guardianEnabled: boolean
  allowlisted: boolean
  alertLevel: GuardianAlertLevel
  dailySummary: boolean
  autoMuteCritical: boolean
  safeMode: TelegramSafeMode
  highRiskAction: TelegramModerationAction
  criticalAction: TelegramModerationAction
  permissionSnapshot: unknown | null
  lastPermissionCheckAt: Date | null
}

export type AdvancedTelegramGroupUpdate = {
  guardianEnabled?: boolean
  allowlisted?: boolean
  alertLevel?: GuardianAlertLevel
  dailySummary?: boolean
  autoMuteCritical?: boolean
  safeMode?: TelegramSafeMode
  highRiskAction?: TelegramModerationAction
  criticalAction?: TelegramModerationAction
}

type UpdateClaimRow = {
  updateId: string
  status: "PROCESSING" | "PROCESSED" | "FAILED"
  attempts: number
  leaseUntil: Date
}

type RateLimitRow = {
  count: number
  expiresAt: Date
}

type DeliveryRow = {
  status: "PENDING" | "DELIVERED" | "FAILED"
  attempts: number
}

const groupSelect = Prisma.sql`
  SELECT
    "id",
    "telegramChatId",
    "title",
    "username",
    "guardianEnabled",
    "allowlisted",
    "alertLevel"::text AS "alertLevel",
    "dailySummary",
    "autoMuteCritical",
    "safeMode",
    "highRiskAction",
    "criticalAction",
    "permissionSnapshot",
    "lastPermissionCheckAt"
  FROM "TelegramGuardianGroup"
`

export async function getAdvancedTelegramGroupSettings(chatId: number | string) {
  const rows = await db.$queryRaw<AdvancedTelegramGroupSettings[]>(
    Prisma.sql`${groupSelect} WHERE "telegramChatId" = ${String(chatId)} LIMIT 1`
  )
  return rows[0] ?? null
}

export async function ensureAdvancedTelegramGroup(
  chat: { id: number; title?: string; username?: string },
  defaultAlertLevel: GuardianAlertLevel
) {
  await ensureTelegramGroup(chat, defaultAlertLevel)
  const group = await getAdvancedTelegramGroupSettings(chat.id)
  if (!group) throw new Error("Telegram Guardian group could not be initialized.")
  return group
}

function updateAssignments(values: AdvancedTelegramGroupUpdate) {
  const assignments: Prisma.Sql[] = []
  if (values.guardianEnabled !== undefined) assignments.push(Prisma.sql`"guardianEnabled" = ${values.guardianEnabled}`)
  if (values.allowlisted !== undefined) assignments.push(Prisma.sql`"allowlisted" = ${values.allowlisted}`)
  if (values.alertLevel !== undefined) assignments.push(Prisma.sql`"alertLevel" = ${values.alertLevel}::"TelegramGuardianAlertLevel"`)
  if (values.dailySummary !== undefined) assignments.push(Prisma.sql`"dailySummary" = ${values.dailySummary}`)
  if (values.autoMuteCritical !== undefined) assignments.push(Prisma.sql`"autoMuteCritical" = ${values.autoMuteCritical}`)
  if (values.safeMode !== undefined) assignments.push(Prisma.sql`"safeMode" = ${values.safeMode}`)
  if (values.highRiskAction !== undefined) assignments.push(Prisma.sql`"highRiskAction" = ${values.highRiskAction}`)
  if (values.criticalAction !== undefined) assignments.push(Prisma.sql`"criticalAction" = ${values.criticalAction}`)
  return assignments
}

export async function updateAdvancedTelegramGroupByChatId(
  chatId: number | string,
  values: AdvancedTelegramGroupUpdate
) {
  const assignments = updateAssignments(values)
  if (!assignments.length) return getAdvancedTelegramGroupSettings(chatId)

  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramGuardianGroup"
      SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "telegramChatId" = ${String(chatId)}
    `
  )
  return getAdvancedTelegramGroupSettings(chatId)
}

export async function updateAdvancedTelegramGroupById(
  id: string,
  values: AdvancedTelegramGroupUpdate
) {
  const assignments = updateAssignments(values)
  if (!assignments.length) return null

  const rows = await db.$queryRaw<AdvancedTelegramGroupSettings[]>(
    Prisma.sql`
      UPDATE "TelegramGuardianGroup"
      SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING
        "id",
        "telegramChatId",
        "title",
        "username",
        "guardianEnabled",
        "allowlisted",
        "alertLevel"::text AS "alertLevel",
        "dailySummary",
        "autoMuteCritical",
        "safeMode",
        "highRiskAction",
        "criticalAction",
        "permissionSnapshot",
        "lastPermissionCheckAt"
    `
  )
  return rows[0] ?? null
}

export async function saveTelegramPermissionSnapshot(chatId: number, snapshot: Record<string, unknown>) {
  const payload = JSON.stringify(snapshot)
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramGuardianGroup"
      SET
        "permissionSnapshot" = ${payload}::jsonb,
        "lastPermissionCheckAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "telegramChatId" = ${String(chatId)}
    `
  )
}

export async function claimTelegramWebhookUpdate(updateId: number) {
  const id = String(updateId)
  const leaseSeconds = 120
  const claimed = await db.$queryRaw<UpdateClaimRow[]>(
    Prisma.sql`
      INSERT INTO "TelegramWebhookUpdate" (
        "updateId", "status", "attempts", "leaseUntil", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, 'PROCESSING', 1,
        CURRENT_TIMESTAMP + (${leaseSeconds} * INTERVAL '1 second'),
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("updateId") DO UPDATE SET
        "status" = 'PROCESSING',
        "attempts" = "TelegramWebhookUpdate"."attempts" + 1,
        "leaseUntil" = CURRENT_TIMESTAMP + (${leaseSeconds} * INTERVAL '1 second'),
        "lastError" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE
        "TelegramWebhookUpdate"."status" = 'FAILED'
        OR (
          "TelegramWebhookUpdate"."status" = 'PROCESSING'
          AND "TelegramWebhookUpdate"."leaseUntil" < CURRENT_TIMESTAMP
        )
      RETURNING "updateId", "status", "attempts", "leaseUntil"
    `
  )

  if (claimed[0]) return { claimed: true, status: claimed[0].status, attempts: claimed[0].attempts }

  const existing = await db.$queryRaw<UpdateClaimRow[]>(
    Prisma.sql`
      SELECT "updateId", "status", "attempts", "leaseUntil"
      FROM "TelegramWebhookUpdate"
      WHERE "updateId" = ${id}
      LIMIT 1
    `
  )
  return {
    claimed: false,
    status: existing[0]?.status ?? "PROCESSING",
    attempts: existing[0]?.attempts ?? 1,
  }
}

export async function markTelegramWebhookUpdateProcessed(updateId: number) {
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramWebhookUpdate"
      SET
        "status" = 'PROCESSED',
        "processedAt" = CURRENT_TIMESTAMP,
        "leaseUntil" = CURRENT_TIMESTAMP,
        "lastError" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "updateId" = ${String(updateId)}
    `
  )
}

export async function markTelegramWebhookUpdateFailed(updateId: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramWebhookUpdate"
      SET
        "status" = 'FAILED',
        "leaseUntil" = CURRENT_TIMESTAMP,
        "lastError" = ${message.slice(0, 2000)},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "updateId" = ${String(updateId)}
    `
  )
}

async function consumePersistentBucket(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<RateLimitRow[]>(
    Prisma.sql`
      INSERT INTO "TelegramRateLimitBucket" (
        "key", "count", "windowStart", "expiresAt", "updatedAt"
      )
      VALUES (
        ${key}, 1, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + (${windowSeconds} * INTERVAL '1 second'),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "TelegramRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "TelegramRateLimitBucket"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "TelegramRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
          ELSE "TelegramRateLimitBucket"."windowStart"
        END,
        "expiresAt" = CASE
          WHEN "TelegramRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${windowSeconds} * INTERVAL '1 second')
          ELSE "TelegramRateLimitBucket"."expiresAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "count", "expiresAt"
    `
  )

  const row = rows[0]
  if (!row) return { allowed: false, retryAfterSeconds: windowSeconds }
  return {
    allowed: row.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)),
  }
}

export async function consumePersistentTelegramScanAllowance(input: {
  chatId: number
  userId?: number
  group: boolean
}) {
  if (!input.group) {
    return consumePersistentBucket(`telegram:private:${input.userId ?? input.chatId}`, 10, 60)
  }

  const groupResult = await consumePersistentBucket(`telegram:group:${input.chatId}`, 30, 60)
  if (!groupResult.allowed) return groupResult
  if (!input.userId) return groupResult

  const userResult = await consumePersistentBucket(
    `telegram:group-user:${input.chatId}:${input.userId}`,
    8,
    60
  )
  return userResult.allowed ? groupResult : userResult
}

export async function prepareTelegramDelivery(input: {
  updateId: number
  actionIndex: number
  method: string
  chatId?: number
}) {
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "TelegramDeliveryEvent" (
        "updateId", "actionIndex", "method", "chatId", "status", "attempts", "createdAt", "updatedAt"
      )
      VALUES (
        ${String(input.updateId)}, ${input.actionIndex}, ${input.method},
        ${input.chatId === undefined ? null : String(input.chatId)},
        'PENDING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("updateId", "actionIndex") DO NOTHING
    `
  )

  const rows = await db.$queryRaw<DeliveryRow[]>(
    Prisma.sql`
      SELECT "status", "attempts"
      FROM "TelegramDeliveryEvent"
      WHERE "updateId" = ${String(input.updateId)}
        AND "actionIndex" = ${input.actionIndex}
      LIMIT 1
    `
  )
  return {
    skip: rows[0]?.status === "DELIVERED",
    status: rows[0]?.status ?? "PENDING",
    attempts: rows[0]?.attempts ?? 0,
  }
}

export async function markTelegramDeliveryDelivered(input: {
  updateId: number
  actionIndex: number
  attempts: number
}) {
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramDeliveryEvent"
      SET
        "status" = 'DELIVERED',
        "attempts" = "attempts" + ${Math.max(1, input.attempts)},
        "lastError" = NULL,
        "deliveredAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "updateId" = ${String(input.updateId)}
        AND "actionIndex" = ${input.actionIndex}
    `
  )
}

export async function markTelegramDeliveryFailed(input: {
  updateId: number
  actionIndex: number
  attempts: number
  error: unknown
}) {
  const message = input.error instanceof Error ? input.error.message : String(input.error)
  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramDeliveryEvent"
      SET
        "status" = 'FAILED',
        "attempts" = "attempts" + ${Math.max(1, input.attempts)},
        "lastError" = ${message.slice(0, 2000)},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "updateId" = ${String(input.updateId)}
        AND "actionIndex" = ${input.actionIndex}
    `
  )
}

export async function getAdvancedTelegramModerationTarget(eventId: string) {
  const rows = await db.$queryRaw<
    Array<{
      chatId: string
      userId: string | null
      messageId: number
      riskLevel: string
      alerted: boolean
      createdAt: Date
      groupId: string | null
    }>
  >(
    Prisma.sql`
      SELECT
        "telegramChatId" AS "chatId",
        "telegramUserId" AS "userId",
        "telegramMessageId" AS "messageId",
        "riskLevel",
        "alerted",
        "createdAt",
        "groupId"
      FROM "TelegramScanEvent"
      WHERE "id" = ${eventId}
      LIMIT 1
    `
  )
  const event = rows[0]
  if (
    !event?.groupId ||
    !event.userId ||
    !event.alerted ||
    !["HIGH_RISK", "CRITICAL"].includes(event.riskLevel) ||
    event.createdAt < new Date(Date.now() - 24 * 60 * 60 * 1000)
  ) {
    return null
  }
  return {
    chatId: Number(event.chatId),
    userId: Number(event.userId),
    messageId: event.messageId,
  }
}

export async function getAdvancedTelegramGuardianAdminOverview() {
  const base = await getTelegramGuardianAdminOverview()
  const advanced = await db.$queryRaw<
    Array<{
      id: string
      safeMode: TelegramSafeMode
      highRiskAction: TelegramModerationAction
      criticalAction: TelegramModerationAction
      permissionSnapshot: unknown | null
      lastPermissionCheckAt: Date | null
    }>
  >(
    Prisma.sql`
      SELECT
        "id",
        "safeMode",
        "highRiskAction",
        "criticalAction",
        "permissionSnapshot",
        "lastPermissionCheckAt"
      FROM "TelegramGuardianGroup"
    `
  )
  const advancedById = new Map(advanced.map((group) => [group.id, group]))

  const [deliveryFailures, processedUpdates, registryProjects] = await Promise.all([
    db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "TelegramDeliveryEvent"
        WHERE "status" = 'FAILED'
          AND "updatedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `
    ),
    db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "TelegramWebhookUpdate"
        WHERE "status" = 'PROCESSED'
          AND "processedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `
    ),
    db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "TelegramProjectRegistry"
        WHERE "active" = TRUE
      `
    ),
  ])

  return {
    ...base,
    stats: {
      ...base.stats,
      deliveryFailures24h: Number(deliveryFailures[0]?.count ?? 0n),
      processedUpdates24h: Number(processedUpdates[0]?.count ?? 0n),
      registryProjects: Number(registryProjects[0]?.count ?? 0n),
    },
    groups: base.groups.map((group) => ({
      ...group,
      ...(advancedById.get(group.id) ?? {
        safeMode: "SILENT" as const,
        highRiskAction: "ADMIN_REVIEW" as const,
        criticalAction: "ADMIN_REVIEW" as const,
        permissionSnapshot: null,
        lastPermissionCheckAt: null,
      }),
    })),
  }
}
