import { NextResponse } from "next/server"

import {
  handleTelegramUpdate,
  type TelegramBotAction,
  type TelegramBotContext,
  type TelegramUpdate,
} from "@/lib/telegram/bot"
import { answerTelegramCallbackQuery, isTelegramGroupAdmin, muteTelegramMember, sendTelegramAction } from "@/lib/telegram/api"
import {
  ensureTelegramGroup,
  getTelegramGroupSummary,
  getTelegramHistory,
  claimTelegramGroup,
  authorizeTelegramGuardianAdmin,
  getTelegramModerationTarget,
  recordTelegramScan,
  updateTelegramGroupSettings,
} from "@/lib/telegram/store"
import { enforceTelegramGroupPolicies } from "@/lib/team-policy/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

function isSecretValid(request: Request) {
  const configured = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!configured) return true
  return request.headers.get("x-telegram-bot-api-secret-token") === configured
}

function environmentAllowsGroup(chatId: number) {
  const configured = process.env.TELEGRAM_GROUP_ALLOWLIST?.trim()
  if (!configured) return true
  const allowed = new Set(configured.split(",").map((value) => value.trim()).filter(Boolean))
  return allowed.has(String(chatId))
}

export async function POST(request: Request) {
  if (!isSecretValid(request)) {
    return NextResponse.json({ error: "Invalid Telegram webhook secret" }, { status: 401 })
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ error: "Invalid Telegram update" }, { status: 400 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const callback = update.callback_query
  if (callback?.id && callback.data?.startsWith("sg_mute:")) {
    if (!token || !callback.from?.id || !callback.message?.chat?.id) return NextResponse.json({ ok: false, error: "Telegram moderation is not configured." }, { status: 400 })
    const target = await getTelegramModerationTarget(callback.data.slice("sg_mute:".length))
    const isAdmin = await isTelegramGroupAdmin(token, callback.message.chat.id, callback.from.id)
    if (!target || target.chatId !== callback.message.chat.id) {
      await answerTelegramCallbackQuery(token, callback.id, "This moderation action is no longer available.", true)
      return NextResponse.json({ ok: false, error: "Invalid moderation target" }, { status: 400 })
    }
    if (!isAdmin) {
      await answerTelegramCallbackQuery(token, callback.id, "Only group administrators can mute a sender.", true)
      return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 })
    }
    try {
      await muteTelegramMember(token, target.chatId, target.userId)
      await answerTelegramCallbackQuery(token, callback.id, "Sender muted for one hour.")
      return NextResponse.json({ ok: true, moderation: "muted_1h" })
    } catch (error) {
      await answerTelegramCallbackQuery(token, callback.id, "The bot needs permission to restrict members in this group.", true).catch(() => undefined)
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Telegram moderation failed" }, { status: 500 })
    }
  }
  const message = update.message ?? update.edited_message
  const isGroup = message?.chat.type === "group" || message?.chat.type === "supergroup"
  let groupSettings: TelegramBotContext["groupSettings"]

  if (isGroup && message) {
    try {
      const stored = await ensureTelegramGroup(message.chat, configuredGroupAlertLevel())
      groupSettings = {
        ...stored,
        allowlisted: stored.allowlisted && environmentAllowsGroup(message.chat.id),
      }
    } catch (error) {
      console.error("Telegram group settings could not be loaded", error)
      groupSettings = {
        guardianEnabled: false,
        allowlisted: false,
        alertLevel: configuredGroupAlertLevel(),
        dailySummary: false,
      }
    }
  }

  let actions: TelegramBotAction[]
  try {
    actions = await handleTelegramUpdate(update, {
      publicBaseUrl: configuredPublicBaseUrl(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      groupAlertLevel: configuredGroupAlertLevel(),
      groupSettings,
      isGroupAdmin: async (chatId, userId) => {
        if (!token) return false
        return isTelegramGroupAdmin(token, chatId, userId)
      },
      updateGroupSettings: (chatId, values) => updateTelegramGroupSettings(chatId, values),
      claimGroup: (chatId, code) => claimTelegramGroup(chatId, code),
      authorizeGroupManager: (chatId, userId) => authorizeTelegramGuardianAdmin(chatId, userId),
      loadHistory: getTelegramHistory,
      loadSummary: getTelegramGroupSummary,
      recordScan: ({ message: scanMessage, candidate, result, source, alerted }) =>
        recordTelegramScan({
          updateId: update.update_id,
          chatId: scanMessage.chat.id,
          messageId: scanMessage.message_id,
          userId: scanMessage.from?.id,
          group:
            scanMessage.chat.type === "group" || scanMessage.chat.type === "supergroup"
              ? {
                  title: scanMessage.chat.title,
                  username: scanMessage.chat.username,
                }
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
      applyTeamPolicy: ({ candidate, result, chatId }) => enforceTelegramGroupPolicies(chatId, result, candidate.value),
    })
  } catch (error) {
    console.error("Telegram update handling failed", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Telegram update handling failed",
      },
      { status: 500 }
    )
  }

  if (!token) {
    return NextResponse.json({
      ok: true,
      delivered: 0,
      pending: actions.length,
      warning: "TELEGRAM_BOT_TOKEN is not configured; actions were not delivered.",
    })
  }

  let delivered = 0
  const errors: string[] = []
  for (const action of actions) {
    try {
      await sendTelegramAction(token, action)
      delivered += 1
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Telegram delivery failed")
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    delivered,
    failed: errors.length,
    errors: errors.slice(0, 3),
  })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ScamGuard Telegram Bot webhook",
    configured: {
      token: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
      secret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      groupAlertLevel: configuredGroupAlertLevel(),
      groupAllowlist: Boolean(process.env.TELEGRAM_GROUP_ALLOWLIST?.trim()),
    },
  })
}
