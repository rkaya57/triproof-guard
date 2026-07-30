import { createHash } from "node:crypto"

import { db } from "@/lib/db/prisma"
import { getSubscriptionEntitlement, hashTelegramConnectCode } from "@/lib/billing/subscription"

export type GuardianAlertLevel = "CAUTION" | "HIGH_RISK" | "CRITICAL"

export type GuardianGroupSettings = {
  id: string
  telegramChatId: string
  title: string | null
  username: string | null
  guardianEnabled: boolean
  allowlisted: boolean
  alertLevel: GuardianAlertLevel
  dailySummary: boolean
}

export type TelegramScanRecordInput = {
  updateId: number
  chatId: number
  messageId: number
  userId?: number
  group?: {
    title?: string
    username?: string
  }
  target: string
  scanType: string
  source: "PRIVATE_COMMAND" | "GROUP_GUARDIAN"
  chain: string
  riskLevel: string
  score: number
  confidence: string
  summary: string
  domain?: string
  alerted: boolean
}

export type TelegramScanRecordResult = {
  occurrenceCount: number
  repeatedCampaign: boolean
}

const riskRank: Record<string, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
}

function fingerprint(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

function storedTarget(input: TelegramScanRecordInput, targetHash: string) {
  if (input.scanType === "transaction") return `Transaction payload ${targetHash.slice(0, 12)}`
  return input.target.slice(0, 500)
}

function groupDefaults(chatId: number, group?: TelegramScanRecordInput["group"]) {
  return {
    telegramChatId: String(chatId),
    title: group?.title?.trim() || null,
    username: group?.username?.trim() || null,
  }
}

export async function ensureTelegramGroup(
  chat: { id: number; title?: string; username?: string },
  defaultAlertLevel: GuardianAlertLevel
): Promise<GuardianGroupSettings> {
  const values = groupDefaults(chat.id, chat)
  return db.telegramGuardianGroup.upsert({
    where: { telegramChatId: values.telegramChatId },
    create: {
      ...values,
      alertLevel: defaultAlertLevel,
    },
    update: {
      title: values.title,
      username: values.username,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      telegramChatId: true,
      title: true,
      username: true,
      guardianEnabled: true,
      allowlisted: true,
      alertLevel: true,
      dailySummary: true,
    },
  })
}

export async function updateTelegramGroupSettings(
  chatId: number,
  values: {
    guardianEnabled?: boolean
    alertLevel?: GuardianAlertLevel
    dailySummary?: boolean
  }
) {
  return db.telegramGuardianGroup.update({
    where: { telegramChatId: String(chatId) },
    data: values,
    select: {
      guardianEnabled: true,
      allowlisted: true,
      alertLevel: true,
      dailySummary: true,
    },
  })
}

export async function claimTelegramGroup(chatId: number, code: string) {
  const codeHash = hashTelegramConnectCode(code)
  const now = new Date()
  return db.$transaction(async (tx) => {
    const invite = await tx.telegramGroupInvite.findUnique({
      where: { codeHash },
      include: { user: { select: { id: true, email: true } } },
    })
    if (!invite || invite.usedAt || invite.expiresAt <= now) return { ok: false, reason: "This connection code is invalid or expired." }
    const entitlement = await getSubscriptionEntitlement(invite.user)
    if (entitlement.plan.telegramGroupLimit <= 0) return { ok: false, reason: "The linked account needs a Community or API Growth plan." }
    const ownedCount = await tx.telegramGuardianGroup.count({ where: { ownerId: invite.userId } })
    if (ownedCount >= entitlement.plan.telegramGroupLimit) return { ok: false, reason: `This plan can protect up to ${entitlement.plan.telegramGroupLimit} Telegram group.` }
    const group = await tx.telegramGuardianGroup.upsert({
      where: { telegramChatId: String(chatId) },
      create: { telegramChatId: String(chatId), ownerId: invite.userId, allowlisted: true, guardianEnabled: true },
      update: { ownerId: invite.userId, allowlisted: true, guardianEnabled: true, lastSeenAt: now },
    })
    await tx.telegramGroupInvite.update({ where: { id: invite.id }, data: { usedAt: now } })
    return { ok: true, title: group.title ?? "this group", plan: entitlement.plan.name }
  })
}

export async function recordTelegramScan(input: TelegramScanRecordInput): Promise<TelegramScanRecordResult> {
  const targetHash = fingerprint(input.target)
  const chatId = String(input.chatId)
  const domain = input.domain?.toLowerCase() || null
  const group =
    input.source === "GROUP_GUARDIAN"
      ? await ensureTelegramGroup(
          { id: input.chatId, title: input.group?.title, username: input.group?.username },
          "HIGH_RISK"
        )
      : null

  const existing = await db.telegramScanEvent.findUnique({
    where: {
      telegramChatId_telegramMessageId_targetHash: {
        telegramChatId: chatId,
        telegramMessageId: input.messageId,
        targetHash,
      },
    },
    select: { id: true },
  })

  if (existing) {
    if (!group) return { occurrenceCount: 1, repeatedCampaign: false }
    const campaign = await db.telegramThreatCampaign.findUnique({
      where: { groupId_fingerprint: { groupId: group.id, fingerprint: targetHash } },
      select: { occurrenceCount: true },
    })
    return {
      occurrenceCount: campaign?.occurrenceCount ?? 1,
      repeatedCampaign: false,
    }
  }

  const now = new Date()
  const campaignCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const repeatAlertCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  return db.$transaction(async (tx) => {
    await tx.telegramScanEvent.create({
      data: {
        groupId: group?.id,
        telegramUpdateId: String(input.updateId),
        telegramChatId: chatId,
        telegramMessageId: input.messageId,
        telegramUserId: input.userId ? String(input.userId) : null,
        target: storedTarget(input, targetHash),
        targetHash,
        domain,
        scanType: input.scanType,
        source: input.source,
        chain: input.chain,
        riskLevel: input.riskLevel,
        score: input.score,
        confidence: input.confidence,
        summary: input.summary.slice(0, 1200),
        alerted: input.alerted,
      },
    })

    if (!group) return { occurrenceCount: 1, repeatedCampaign: false }

    const previous = await tx.telegramThreatCampaign.findUnique({
      where: { groupId_fingerprint: { groupId: group.id, fingerprint: targetHash } },
    })
    const withinWindow = Boolean(previous && previous.lastSeenAt >= campaignCutoff)
    const occurrenceCount = withinWindow ? (previous?.occurrenceCount ?? 0) + 1 : 1
    const previousHighest = previous?.highestRisk ?? "SAFE"
    const highestRisk =
      (riskRank[input.riskLevel] ?? 0) >= (riskRank[previousHighest] ?? 0) ? input.riskLevel : previousHighest
    const repeatedCampaign =
      occurrenceCount >= 3 &&
      (!previous?.lastAlertAt || previous.lastAlertAt < repeatAlertCutoff)

    await tx.telegramThreatCampaign.upsert({
      where: { groupId_fingerprint: { groupId: group.id, fingerprint: targetHash } },
      create: {
        groupId: group.id,
        fingerprint: targetHash,
        target: storedTarget(input, targetHash),
        domain,
        occurrenceCount,
        highestRisk,
        firstSeenAt: now,
        lastSeenAt: now,
        lastAlertAt: repeatedCampaign ? now : null,
      },
      update: {
        target: storedTarget(input, targetHash),
        domain,
        occurrenceCount,
        highestRisk,
        firstSeenAt: withinWindow ? previous?.firstSeenAt : now,
        lastSeenAt: now,
        lastAlertAt: repeatedCampaign ? now : previous?.lastAlertAt,
      },
    })

    await tx.telegramGuardianGroup.update({
      where: { id: group.id },
      data: {
        scanCount: { increment: 1 },
        alertCount: input.alerted ? { increment: 1 } : undefined,
        lastSeenAt: now,
      },
    })

    return { occurrenceCount, repeatedCampaign }
  })
}

export async function getTelegramHistory(chatId: number, limit = 6) {
  return db.telegramScanEvent.findMany({
    where: { telegramChatId: String(chatId) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 10),
    select: {
      target: true,
      domain: true,
      scanType: true,
      riskLevel: true,
      score: true,
      alerted: true,
      createdAt: true,
    },
  })
}

export async function getTelegramGroupSummary(chatId: number | string, hours = 24) {
  const since = new Date(Date.now() - Math.max(hours, 1) * 60 * 60 * 1000)
  const where = {
    telegramChatId: String(chatId),
    createdAt: { gte: since },
  }
  const [total, alerts, critical, repeated] = await Promise.all([
    db.telegramScanEvent.count({ where }),
    db.telegramScanEvent.count({ where: { ...where, alerted: true } }),
    db.telegramScanEvent.count({ where: { ...where, riskLevel: "CRITICAL" } }),
    db.telegramThreatCampaign.count({
      where: {
        group: { telegramChatId: String(chatId) },
        occurrenceCount: { gte: 3 },
        lastSeenAt: { gte: since },
      },
    }),
  ])
  return { hours, total, alerts, critical, repeated }
}

export async function getTelegramGuardianAdminOverview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [groups, totalGroups, activeGroups, scans24h, alerts24h, recentScans] = await Promise.all([
    db.telegramGuardianGroup.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 100,
      select: {
        id: true,
        telegramChatId: true,
        title: true,
        username: true,
        guardianEnabled: true,
        allowlisted: true,
        alertLevel: true,
        dailySummary: true,
        scanCount: true,
        alertCount: true,
        lastSeenAt: true,
        lastSummaryAt: true,
        createdAt: true,
      },
    }),
    db.telegramGuardianGroup.count(),
    db.telegramGuardianGroup.count({ where: { guardianEnabled: true, allowlisted: true } }),
    db.telegramScanEvent.count({ where: { createdAt: { gte: since } } }),
    db.telegramScanEvent.count({ where: { alerted: true, createdAt: { gte: since } } }),
    db.telegramScanEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        telegramChatId: true,
        target: true,
        domain: true,
        riskLevel: true,
        score: true,
        alerted: true,
        source: true,
        createdAt: true,
        group: { select: { title: true } },
      },
    }),
  ])

  return {
    stats: {
      groups: totalGroups,
      activeGroups,
      scans24h,
      alerts24h,
    },
    groups,
    recentScans,
  }
}

export async function updateTelegramGroupFromAdmin(
  id: string,
  values: {
    guardianEnabled?: boolean
    allowlisted?: boolean
    alertLevel?: GuardianAlertLevel
    dailySummary?: boolean
  }
) {
  return db.telegramGuardianGroup.update({
    where: { id },
    data: values,
  })
}

export async function getDueTelegramSummaries() {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000)
  return db.telegramGuardianGroup.findMany({
    where: {
      guardianEnabled: true,
      allowlisted: true,
      dailySummary: true,
      OR: [{ lastSummaryAt: null }, { lastSummaryAt: { lt: cutoff } }],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    select: {
      id: true,
      telegramChatId: true,
      title: true,
    },
  })
}

export async function markTelegramSummarySent(groupId: string) {
  await db.telegramGuardianGroup.update({
    where: { id: groupId },
    data: { lastSummaryAt: new Date() },
  })
}
