import { NextResponse } from "next/server"

import { sendTelegramMessage } from "@/lib/telegram/api"
import { formatGuardianSummary } from "@/lib/telegram/bot"
import {
  getDueTelegramSummaries,
  getTelegramGroupSummary,
  markTelegramSummarySent,
} from "@/lib/telegram/store"
import { isWorkerAuthorized, workerUnauthorized } from "@/lib/worker/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 503 })
  }

  const groups = await getDueTelegramSummaries()
  let delivered = 0
  let skipped = 0
  const errors: string[] = []

  for (const group of groups) {
    try {
      const summary = await getTelegramGroupSummary(group.telegramChatId, 24)
      if (summary.total > 0) {
        await sendTelegramMessage(token, group.telegramChatId, formatGuardianSummary(summary))
        delivered += 1
      } else {
        skipped += 1
      }
      await markTelegramSummarySent(group.id)
    } catch (error) {
      errors.push(
        `${group.title ?? group.telegramChatId}: ${
          error instanceof Error ? error.message : "Summary delivery failed"
        }`
      )
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    checked: groups.length,
    delivered,
    skipped,
    failed: errors.length,
    errors: errors.slice(0, 10),
  })
}
