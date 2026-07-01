import { NextResponse } from "next/server"

import { isDatabaseConnectionError } from "@/lib/db/errors"
import { retryWebhookDeliveries } from "@/lib/webhooks/retry"
import { boundedNumber, isWorkerAuthorized, workerUnauthorized } from "@/lib/worker/auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const url = new URL(request.url)
  const limit = boundedNumber(url.searchParams.get("limit"), 10, 1, 50)
  const maxAttempts = boundedNumber(url.searchParams.get("maxAttempts"), 3, 1, 10)

  try {
    const result = await retryWebhookDeliveries({ limit, maxAttempts })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for webhook retry" }, { status: 503 })
    }
    throw error
  }
}

export async function POST(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const url = new URL(request.url)
  const limit = boundedNumber(url.searchParams.get("limit"), 10, 1, 50)
  const maxAttempts = boundedNumber(url.searchParams.get("maxAttempts"), 3, 1, 10)

  try {
    const result = await retryWebhookDeliveries({ limit, maxAttempts })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for webhook retry" }, { status: 503 })
    }
    throw error
  }
}
