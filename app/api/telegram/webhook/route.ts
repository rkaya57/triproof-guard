import { NextResponse } from "next/server"

import { handleTelegramUpdate, type TelegramBotAction, type TelegramUpdate } from "@/lib/telegram/bot"

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

async function sendTelegramAction(token: string, action: TelegramBotAction) {
  if (action.method !== "sendMessage") return

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action.payload),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body.slice(0, 300)}`)
  }
}

export async function POST(request: Request) {
  if (!isSecretValid(request)) {
    return NextResponse.json({ error: "Invalid Telegram webhook secret" }, { status: 401 })
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ error: "Invalid Telegram update" }, { status: 400 })
  }

  const actions = await handleTelegramUpdate(update, {
    publicBaseUrl: configuredPublicBaseUrl(),
    groupAlertLevel: configuredGroupAlertLevel(),
  })

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
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
      groupAlertLevel: configuredGroupAlertLevel(),
    },
  })
}
