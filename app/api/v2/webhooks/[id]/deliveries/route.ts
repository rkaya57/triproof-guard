import type { WebhookDeliveryStatus } from "@prisma/client"

import { apiError } from "@/lib/api/auth"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { requireWebhookApiAccess } from "@/lib/webhooks/api-access"
import { serializeWebhookDelivery } from "@/lib/webhooks/observability"

export const runtime = "nodejs"

const deliveryStatuses = new Set<WebhookDeliveryStatus>(["pending", "failed", "delivered"])

function boundedLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed)) return 25
  return Math.min(100, Math.max(1, parsed))
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireWebhookApiAccess(request)
  if (access.error) return access.error
  const { id } = await context.params
  const url = new URL(request.url)
  const limit = boundedLimit(url.searchParams.get("limit"))
  const cursor = url.searchParams.get("cursor")?.trim() || null
  const rawStatus = url.searchParams.get("status")?.trim() || null

  if (rawStatus && !deliveryStatuses.has(rawStatus as WebhookDeliveryStatus)) {
    return apiError("Unsupported webhook delivery status", 400, { code: "INVALID_WEBHOOK_DELIVERY_STATUS" })
  }
  const statusParam = rawStatus as WebhookDeliveryStatus | null

  try {
    const endpoint = await db.webhookEndpoint.findFirst({
      where: { id, userId: access.auth.user.id },
      select: { id: true },
    })
    if (!endpoint) return apiError("Webhook endpoint not found", 404)

    if (cursor) {
      const cursorRow = await db.webhookDelivery.findFirst({
        where: { id: cursor, endpointId: id },
        select: { id: true },
      })
      if (!cursorRow) return apiError("Webhook delivery cursor not found", 400, { code: "INVALID_WEBHOOK_CURSOR" })
    }

    const deliveries = await db.webhookDelivery.findMany({
      where: {
        endpointId: id,
        status: statusParam ?? undefined,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
    })

    const hasMore = deliveries.length > limit
    const page = hasMore ? deliveries.slice(0, limit) : deliveries
    const nextCursor = hasMore ? page.at(-1)?.id ?? null : null

    return Response.json({
      object: "webhook_delivery_list",
      apiVersion: "v2",
      endpointId: id,
      deliveries: page.map(serializeWebhookDelivery),
      nextCursor,
      hasMore,
      filters: { status: statusParam },
      links: {
        endpoint: `/api/v2/webhooks/${id}`,
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook delivery history", 503)
    throw error
  }
}
