import { createHash } from "node:crypto"

import { db } from "@/lib/db/prisma"
import { getSubscriptionEntitlement, hashTelegramConnectCode } from "@/lib/billing/subscription"
import { saveScamGuardFeedback, type ScamGuardFeedbackVerdict } from "@/lib/scamguard/feedback"

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
  autoMuteCritical: boolean
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
  eventId?: string
  occurrenceCount: number
  repeatedCampaign: boolean
  senderBehavior?: {
    recentPosts: number
    highRiskPosts: number
    repeatTargetPosts: number
    moderationRecommended: boolean
  }
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

export type TelegramWatchItem = {
  id: string
  target: string
  domain: string | null
  scanType: string
  chain: string
  active: boolean
  lastRiskLevel: string | null
  lastScore: number | null
  lastAlertedAt: Date | null
  createdAt: Date
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
      autoMuteCritical: true,
    },
  })
}

export async function updateTelegramGroupSettings(
  chatId: number,
  values: {
    guardianEnabled?: boolean
    alertLevel?: GuardianAlertLevel
    dailySummary?: boolean
    autoMuteCritical?: boolean
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
      autoMuteCritical: true,
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
    if (!entitlement.isAdmin && entitlement.plan.telegramGroupLimit <= 0) return { ok: false, reason: "The linked account needs a Community or API Growth plan." }
    const ownedCount = await tx.telegramGuardianGroup.count({ where: { ownerId: invite.userId } })
    if (!entitlement.isAdmin && ownedCount >= entitlement.plan.telegramGroupLimit) return { ok: false, reason: `This plan can protect up to ${entitlement.plan.telegramGroupLimit} Telegram group.` }
    const group = await tx.telegramGuardianGroup.upsert({
      where: { telegramChatId: String(chatId) },
      create: { telegramChatId: String(chatId), ownerId: invite.userId, allowlisted: true, guardianEnabled: true },
      update: { ownerId: invite.userId, allowlisted: true, guardianEnabled: true, lastSeenAt: now },
    })
    await tx.telegramGroupInvite.update({ where: { id: invite.id }, data: { usedAt: now } })
    return { ok: true, title: group.title ?? "this group", plan: entitlement.plan.name }
  })
}

export async function authorizeTelegramGuardianAdmin(chatId: number, telegramUserId: number) {
  const group = await db.telegramGuardianGroup.findUnique({
    where: { telegramChatId: String(chatId) },
    select: { id: true, owner: { select: { id: true, email: true } } },
  })
  if (!group?.owner) return false
  const entitlement = await getSubscriptionEntitlement(group.owner)
  if (entitlement.isAdmin) return true
  const limit = entitlement.plan.telegramAdminLimit
  if (limit <= 0) return false
  const existing = await db.telegramGuardianAdmin.findUnique({
    where: { groupId_telegramUserId: { groupId: group.id, telegramUserId: String(telegramUserId) } },
    select: { id: true },
  })
  if (existing) return true
  const used = await db.telegramGuardianAdmin.count({ where: { groupId: group.id } })
  if (used >= limit) return false
  await db.telegramGuardianAdmin.create({ data: { groupId: group.id, telegramUserId: String(telegramUserId) } })
  return true
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
    const event = await tx.telegramScanEvent.create({
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

    if (!group) return { eventId: event.id, occurrenceCount: 1, repeatedCampaign: false }

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

    const senderBehavior = input.userId
      ? await (async () => {
          const senderWhere = { telegramChatId: chatId, telegramUserId: String(input.userId) }
          const [recentPosts, highRiskPosts, repeatTargetPosts] = await Promise.all([
            tx.telegramScanEvent.count({ where: { ...senderWhere, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } }),
            tx.telegramScanEvent.count({ where: { ...senderWhere, riskLevel: { in: ["HIGH_RISK", "CRITICAL"] }, createdAt: { gte: campaignCutoff } } }),
            tx.telegramScanEvent.count({ where: { ...senderWhere, targetHash, createdAt: { gte: campaignCutoff } } }),
          ])
          return { recentPosts, highRiskPosts, repeatTargetPosts, moderationRecommended: highRiskPosts >= 2 || repeatTargetPosts >= 2 || recentPosts >= 5 }
        })()
      : undefined

    return { eventId: event.id, occurrenceCount, repeatedCampaign, senderBehavior }
  })
}

export async function getTelegramModerationTarget(eventId: string) {
  const event = await db.telegramScanEvent.findUnique({
    where: { id: eventId },
    select: { telegramChatId: true, telegramUserId: true, riskLevel: true, alerted: true, createdAt: true, groupId: true },
  })
  if (!event?.groupId || !event.telegramUserId || !event.alerted || !["HIGH_RISK", "CRITICAL"].includes(event.riskLevel) || event.createdAt < new Date(Date.now() - 24 * 60 * 60 * 1000)) return null
  return { chatId: Number(event.telegramChatId), userId: Number(event.telegramUserId) }
}

export async function addTelegramWatch(input: {
  telegramUserId: number
  telegramChatId: number
  target: string
  domain?: string | null
  scanType: string
  chain: string
  riskLevel?: string
  score?: number
}) {
  const target = input.target.trim().slice(0, 500)
  if (!target) throw new Error("A target is required for a watch.")
  return db.telegramWatchlist.upsert({
    where: {
      telegramUserId_targetHash: {
        telegramUserId: String(input.telegramUserId),
        targetHash: fingerprint(target),
      },
    },
    create: {
      telegramUserId: String(input.telegramUserId),
      telegramChatId: String(input.telegramChatId),
      target,
      targetHash: fingerprint(target),
      domain: input.domain?.toLowerCase() || null,
      scanType: input.scanType,
      chain: input.chain,
      lastRiskLevel: input.riskLevel ?? null,
      lastScore: input.score ?? null,
    },
    update: {
      telegramChatId: String(input.telegramChatId),
      target,
      domain: input.domain?.toLowerCase() || null,
      scanType: input.scanType,
      chain: input.chain,
      active: true,
      lastRiskLevel: input.riskLevel ?? undefined,
      lastScore: input.score ?? undefined,
    },
    select: {
      id: true,
      target: true,
      domain: true,
      scanType: true,
      chain: true,
      active: true,
      lastRiskLevel: true,
      lastScore: true,
      lastAlertedAt: true,
      createdAt: true,
    },
  })
}

export async function addTelegramWatchFromEvent(eventId: string, telegramUserId: number, telegramChatId: number) {
  const event = await db.telegramScanEvent.findUnique({
    where: { id: eventId },
    select: { target: true, domain: true, scanType: true, chain: true, riskLevel: true, score: true, telegramChatId: true },
  })
  if (!event || event.telegramChatId !== String(telegramChatId) || event.scanType === "transaction") {
    return null
  }
  return addTelegramWatch({
    telegramUserId,
    telegramChatId,
    target: event.target,
    domain: event.domain,
    scanType: event.scanType,
    chain: event.chain,
    riskLevel: event.riskLevel,
    score: event.score,
  })
}

export async function listTelegramWatches(telegramUserId: number): Promise<TelegramWatchItem[]> {
  return db.telegramWatchlist.findMany({
    where: { telegramUserId: String(telegramUserId), active: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      target: true,
      domain: true,
      scanType: true,
      chain: true,
      active: true,
      lastRiskLevel: true,
      lastScore: true,
      lastAlertedAt: true,
      createdAt: true,
    },
  })
}

export async function removeTelegramWatch(telegramUserId: number, target: string) {
  const updated = await db.telegramWatchlist.updateMany({
    where: { telegramUserId: String(telegramUserId), targetHash: fingerprint(target.trim()) },
    data: { active: false },
  })
  return updated.count > 0
}

export async function getTelegramWatchAlertRecipients(input: {
  target: string
  riskLevel: string
  score: number
  excludeTelegramUserId?: number
}) {
  if (!["HIGH_RISK", "CRITICAL"].includes(input.riskLevel)) return []
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000)
  const matches = await db.telegramWatchlist.findMany({
    where: {
      targetHash: fingerprint(input.target),
      active: true,
      OR: [{ lastAlertedAt: null }, { lastAlertedAt: { lt: cutoff } }, { lastRiskLevel: { not: input.riskLevel } }],
    },
    select: { id: true, telegramChatId: true, telegramUserId: true, target: true },
  })
  const recipients = matches.filter((item) => item.telegramUserId !== String(input.excludeTelegramUserId ?? ""))
  if (recipients.length) {
    await db.telegramWatchlist.updateMany({
      where: { id: { in: recipients.map((item) => item.id) } },
      data: { lastRiskLevel: input.riskLevel, lastScore: input.score, lastAlertedAt: new Date() },
    })
  }
  return recipients.map((item) => ({ chatId: Number(item.telegramChatId), target: item.target }))
}

export async function saveTelegramScanFeedback(input: {
  eventId: string
  telegramUserId: number
  telegramChatId: number
  verdict: ScamGuardFeedbackVerdict
}) {
  const event = await db.telegramScanEvent.findUnique({
    where: { id: input.eventId },
    select: { target: true, chain: true, telegramChatId: true },
  })
  if (!event || event.telegramChatId !== String(input.telegramChatId)) return null
  return saveScamGuardFeedback({
    scanId: input.eventId,
    verdict: input.verdict,
    value: event.target,
    chain: event.chain,
    source: `telegram:${input.telegramUserId}`,
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
        autoMuteCritical: true,
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
    autoMuteCritical?: boolean
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
