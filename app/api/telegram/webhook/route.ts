import { NextResponse } from "next/server"

import {
  handleTelegramUpdate,
  type TelegramBotAction,
  type TelegramBotContext,
  type TelegramUpdate,
} from "@/lib/telegram/safe-update"
import {
  answerTelegramCallbackQuery,
  deleteTelegramMessage,
  getTelegramBotPermissions,
  isTelegramGroupAdmin,
  muteTelegramMember,
  sendTelegramAction,
  TelegramApiError,
} from "@/lib/telegram/api"
import {
  claimTelegramWebhookUpdate,
  consumePersistentTelegramScanAllowance,
  ensureAdvancedTelegramGroup,
  getAdvancedTelegramModerationTarget,
  markTelegramDeliveryDelivered,
  markTelegramDeliveryFailed,
  markTelegramWebhookUpdateFailed,
  markTelegramWebhookUpdateProcessed,
  prepareTelegramDelivery,
  saveTelegramPermissionSnapshot,
  updateAdvancedTelegramGroupByChatId,
} from "@/lib/telegram/advanced-store"
import {
  addTelegramWatch,
  addTelegramWatchFromEvent,
  getTelegramWatchAlertRecipients,
  getTelegramGroupSummary,
  getTelegramHistory,
  claimTelegramGroup,
  authorizeTelegramGuardianAdmin,
  recordTelegramScan,
  listTelegramWatches,
  removeTelegramWatch,
  saveTelegramScanFeedback,
} from "@/lib/telegram/store"
import { enforceTelegramGroupPolicies } from "@/lib/team-policy/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

function configuredPublicBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return undefined
}

function configuredGroupAlertLevel() {
  const raw = process.env.TELEGRAM_GROUP_ALERT_LEVEL?.trim().toUpperCase()
  if (raw === "CAUTION" || raw === "HIGH_RISK" || raw === "CRITICAL") return raw
  return "HIGH_RISK"
}

function validateWebhookSecret(request: Request) {
  const configured = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!configured) {
    return {
      valid: process.env.NODE_ENV !== "production",
      configured: false,
    }
  }
  return {
    valid: request.headers.get("x-telegram-bot-api-secret-token") === configured,
    configured: true,
  }
}

function environmentAllowsGroup(chatId: number) {
  const configured = process.env.TELEGRAM_GROUP_ALLOWLIST?.trim()
  if (!configured) return true
  const allowed = new Set(configured.split(",").map((value) => value.trim()).filter(Boolean))
  return allowed.has(String(chatId))
}

function actionChatId(action: TelegramBotAction) {
  if (action.method !== "sendMessage") return undefined
  const value = action.payload.chat_id
  return typeof value === "number" ? value : Number(value)
}

function deliveryAttempts(error: unknown) {
  return error instanceof TelegramApiError ? Math.max(1, error.attempts) : 1
}

async function processCallback(update: TelegramUpdate, token: string) {
  const callback = update.callback_query
  if (!callback?.id || !callback.data) return null
  const userId = callback.from?.id
  const chatId = callback.message?.chat?.id

  if (callback.data.startsWith("sg_watch:")) {
    if (!userId || !chatId) return { ok: false, error: "Watchlist action is unavailable." }
    const watch = await addTelegramWatchFromEvent(
      callback.data.slice("sg_watch:".length),
      userId,
      chatId
    )
    await answerTelegramCallbackQuery(
      token,
      callback.id,
      watch ? "Target added to your watchlist." : "This scan cannot be added to your watchlist.",
      !watch
    )
    return { ok: Boolean(watch), watch }
  }

  if (callback.data.startsWith("sg_feedback:")) {
    if (!userId || !chatId) return { ok: false, error: "Feedback action is unavailable." }
    const [, eventId, decision] = callback.data.split(":")
    const verdict = decision === "scam" ? "reported_scam" : decision === "safe" ? "reported_safe" : null
    if (!eventId || !verdict) {
      await answerTelegramCallbackQuery(token, callback.id, "This feedback action is invalid.", true)
      return { ok: false, error: "Invalid feedback action" }
    }
    const feedback = await saveTelegramScanFeedback({
      eventId,
      telegramUserId: userId,
      telegramChatId: chatId,
      verdict,
    })
    await answerTelegramCallbackQuery(
      token,
      callback.id,
      feedback ? "Thanks. Your feedback is queued for review." : "This scan is no longer available.",
      !feedback
    )
    return { ok: Boolean(feedback), feedback }
  }

  if (callback.data.startsWith("sg_mute:") || callback.data.startsWith("sg_delete:")) {
    if (!userId || !chatId) return { ok: false, error: "Telegram moderation is unavailable." }
    const deleting = callback.data.startsWith("sg_delete:")
    const payload = callback.data.slice(deleting ? "sg_delete:".length : "sg_mute:".length)
    const [eventId, requestedHours] = payload.split(":")
    const target = await getAdvancedTelegramModerationTarget(eventId)
    const admin = await isTelegramGroupAdmin(token, chatId, userId)

    if (!target || target.chatId !== chatId) {
      await answerTelegramCallbackQuery(token, callback.id, "This moderation action is no longer available.", true)
      return { ok: false, error: "Invalid moderation target" }
    }
    if (!admin) {
      await answerTelegramCallbackQuery(token, callback.id, "Only group administrators can moderate a sender.", true)
      return { ok: false, error: "Admin access required" }
    }

    if (deleting) {
      await deleteTelegramMessage(token, target.chatId, target.messageId)
      await answerTelegramCallbackQuery(token, callback.id, "Message deleted.")
      return { ok: true, moderation: "message_deleted" }
    }

    const muteHours = requestedHours === "24" ? 24 : 1
    await muteTelegramMember(token, target.chatId, target.userId, muteHours * 60 * 60)
    await answerTelegramCallbackQuery(
      token,
      callback.id,
      `Sender muted for ${muteHours} hour${muteHours === 1 ? "" : "s"}.`
    )
    return { ok: true, moderation: `muted_${muteHours}h` }
  }

  return null
}

async function loadGroupSettings(update: TelegramUpdate) {
  const message = update.message ?? update.edited_message
  const isGroup = message?.chat.type === "group" || message?.chat.type === "supergroup"
  if (!isGroup || !message) return undefined

  try {
    const stored = await ensureAdvancedTelegramGroup(message.chat, configuredGroupAlertLevel())
    return {
      ...stored,
      allowlisted: stored.allowlisted && environmentAllowsGroup(message.chat.id),
    }
  } catch (error) {
    console.error("Telegram group settings could not be loaded", error)
    return {
      id: "unavailable",
      telegramChatId: String(message.chat.id),
      title: message.chat.title ?? null,
      username: message.chat.username ?? null,
      guardianEnabled: false,
      allowlisted: false,
      alertLevel: configuredGroupAlertLevel(),
      dailySummary: false,
      autoMuteCritical: false,
      safeMode: "SILENT" as const,
      highRiskAction: "ADMIN_REVIEW" as const,
      criticalAction: "ADMIN_REVIEW" as const,
      permissionSnapshot: null,
      lastPermissionCheckAt: null,
    }
  }
}

async function buildActions(update: TelegramUpdate, token: string) {
  const groupSettings = await loadGroupSettings(update)
  const context: TelegramBotContext = {
    publicBaseUrl: configuredPublicBaseUrl(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    groupAlertLevel: configuredGroupAlertLevel(),
    groupSettings,
    isGroupAdmin: (chatId, userId) => isTelegramGroupAdmin(token, chatId, userId),
    updateAdvancedGroupSettings: (chatId, values) => updateAdvancedTelegramGroupByChatId(chatId, values),
    consumePersistentAllowance: consumePersistentTelegramScanAllowance,
    deleteMessage: async (chatId, messageId) => deleteTelegramMessage(token, chatId, messageId),
    getBotPermissions: (chatId) => getTelegramBotPermissions(token, chatId),
    savePermissionSnapshot: saveTelegramPermissionSnapshot,
    muteMember: async (chatId, userId, seconds) => {
      await muteTelegramMember(token, chatId, userId, seconds)
      return true
    },
    claimGroup: (chatId, code) => claimTelegramGroup(chatId, code),
    authorizeGroupManager: (chatId, userId) => authorizeTelegramGuardianAdmin(chatId, userId),
    loadHistory: getTelegramHistory,
    loadSummary: getTelegramGroupSummary,
    addWatch: ({ telegramUserId, telegramChatId, candidate, result }) =>
      addTelegramWatch({
        telegramUserId,
        telegramChatId,
        target: candidate.value,
        domain: result.metadata.domain,
        scanType: result.type,
        chain: result.metadata.chain,
        riskLevel: result.riskLevel,
        score: result.score,
      }),
    addWatchFromEvent: addTelegramWatchFromEvent,
    listWatches: listTelegramWatches,
    removeWatch: removeTelegramWatch,
    findWatchAlerts: ({ candidate, result, excludeTelegramUserId }) =>
      getTelegramWatchAlertRecipients({
        target: candidate.value,
        riskLevel: result.riskLevel,
        score: result.score,
        excludeTelegramUserId,
      }),
    recordScan: ({ message: scanMessage, candidate, result, source, alerted }) =>
      recordTelegramScan({
        updateId: update.update_id,
        chatId: scanMessage.chat.id,
        messageId: scanMessage.message_id,
        userId: scanMessage.from?.id,
        group:
          scanMessage.chat.type === "group" || scanMessage.chat.type === "supergroup"
            ? { title: scanMessage.chat.title, username: scanMessage.chat.username }
            : undefined,
        target: candidate.value,
        scanType: result.type,
        source,
        chain: result.metadata.chain,
        riskLevel: result.riskLevel,
        score: result.score,
        confidence: result.confidence,
        summary: result.summary,
        domain: result.metadata.domain,
        alerted,
      }),
    applyTeamPolicy: ({ candidate, result, chatId }) =>
      enforceTelegramGroupPolicies(chatId, result, candidate.value),
  }
  return handleTelegramUpdate(update, context)
}

async function deliverActions(update: TelegramUpdate, token: string, actions: TelegramBotAction[]) {
  let delivered = 0
  let skipped = 0
  const failures: string[] = []

  for (const [actionIndex, action] of actions.entries()) {
    const prepared = await prepareTelegramDelivery({
      updateId: update.update_id,
      actionIndex,
      method: action.method,
      chatId: actionChatId(action),
    })
    if (prepared.skip) {
      skipped += 1
      continue
    }

    try {
      const result = await sendTelegramAction(token, action)
      await markTelegramDeliveryDelivered({
        updateId: update.update_id,
        actionIndex,
        attempts: result.attempts,
      })
      delivered += 1
    } catch (error) {
      await markTelegramDeliveryFailed({
        updateId: update.update_id,
        actionIndex,
        attempts: deliveryAttempts(error),
        error,
      }).catch(() => undefined)
      failures.push(error instanceof Error ? error.message : "Telegram delivery failed")
    }
  }

  if (failures.length) {
    throw new Error(`Telegram delivery failed after retries: ${failures.slice(0, 3).join(" | ")}`)
  }
  return { delivered, skipped }
}

async function processTelegramUpdate(update: TelegramUpdate, token: string) {
  const callbackResult = await processCallback(update, token)
  if (callbackResult) return { ...callbackResult, delivered: 0, skipped: 0 }

  const actions = await buildActions(update, token)
  const delivery = await deliverActions(update, token, actions)
  return { ok: true, ...delivery, actions: actions.length }
}

export async function POST(request: Request) {
  const secret = validateWebhookSecret(request)
  if (!secret.configured && process.env.NODE_ENV === "production") {
    return json({ error: "Telegram webhook secret is not configured" }, 503)
  }
  if (!secret.valid) return json({ error: "Invalid Telegram webhook secret" }, 401)

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null
  if (!update || typeof update.update_id !== "number") {
    return json({ error: "Invalid Telegram update" }, 400)
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return json({ error: "Telegram bot token is not configured" }, 503)

  let claim: Awaited<ReturnType<typeof claimTelegramWebhookUpdate>>
  try {
    claim = await claimTelegramWebhookUpdate(update.update_id)
  } catch (error) {
    console.error("Telegram update idempotency claim failed", error)
    return json({ error: "Telegram update storage is unavailable" }, 503)
  }

  if (!claim.claimed) {
    return json({
      ok: true,
      duplicate: true,
      status: claim.status,
      attempts: claim.attempts,
    })
  }

  try {
    const result = await processTelegramUpdate(update, token)
    await markTelegramWebhookUpdateProcessed(update.update_id)
    return json(result)
  } catch (error) {
    await markTelegramWebhookUpdateFailed(update.update_id, error).catch(() => undefined)
    console.error("Telegram update handling failed", error)
    return json(
      {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : "Telegram update handling failed",
      },
      500
    )
  }
}

export async function GET() {
  const token = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim())
  const secret = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim())
  return json({
    ok: token && (process.env.NODE_ENV !== "production" || secret),
    service: "ScamGuard Telegram Bot webhook",
    configured: {
      token,
      secret,
      strictSecretMode: process.env.NODE_ENV === "production",
      persistentIdempotency: true,
      persistentRateLimit: true,
      deliveryRetry: true,
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      groupAlertLevel: configuredGroupAlertLevel(),
      groupAllowlist: Boolean(process.env.TELEGRAM_GROUP_ALLOWLIST?.trim()),
    },
  })
}
