import { db } from "@/lib/db/prisma"
import { webhookHeaders } from "@/lib/webhooks/sign"

const DEFAULT_WEBHOOK_RETRY_LIMIT = Number.parseInt(process.env.WEBHOOK_RETRY_LIMIT ?? "10", 10)
const DEFAULT_WEBHOOK_MAX_ATTEMPTS = Number.parseInt(process.env.WEBHOOK_MAX_ATTEMPTS ?? "3", 10)

function safeLimit(value = DEFAULT_WEBHOOK_RETRY_LIMIT) {
  if (!Number.isFinite(value)) return 10
  return Math.min(50, Math.max(1, value))
}

function safeMaxAttempts(value = DEFAULT_WEBHOOK_MAX_ATTEMPTS) {
  if (!Number.isFinite(value)) return 3
  return Math.min(10, Math.max(1, value))
}

export async function retryWebhookDeliveries({
  limit = DEFAULT_WEBHOOK_RETRY_LIMIT,
  maxAttempts = DEFAULT_WEBHOOK_MAX_ATTEMPTS,
}: {
  limit?: number
  maxAttempts?: number
} = {}) {
  const deliveryLimit = safeLimit(limit)
  const attemptLimit = safeMaxAttempts(maxAttempts)
  const deliveries = await db.webhookDelivery.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      attemptCount: { lt: attemptLimit },
      endpoint: { isActive: true },
    },
    include: { endpoint: true },
    orderBy: { createdAt: "asc" },
    take: deliveryLimit,
  })

  const results = []

  for (const delivery of deliveries) {
    const payloadString = JSON.stringify(delivery.requestPayload)
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: "POST",
        headers: webhookHeaders(payloadString, delivery.endpoint.secret),
        body: payloadString,
      })
      const responseBody = (await response.text().catch(() => "")).slice(0, 4000)
      const attemptCount = delivery.attemptCount + 1
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.ok ? "delivered" : "failed",
          statusCode: response.status,
          responseBody,
          attemptCount,
          deliveredAt: response.ok ? new Date() : null,
          errorMessage: response.ok ? null : `HTTP ${response.status}`,
        },
      })
      results.push({
        id: delivery.id,
        endpointId: delivery.endpointId,
        status: response.ok ? "delivered" : "failed",
        statusCode: response.status,
        attemptCount,
      })
    } catch (error) {
      const attemptCount = delivery.attemptCount + 1
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          attemptCount,
          errorMessage: error instanceof Error ? error.message : "Webhook retry failed",
        },
      })
      results.push({
        id: delivery.id,
        endpointId: delivery.endpointId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Webhook retry failed",
        attemptCount,
      })
    }
  }

  return {
    attempted: results.length,
    delivered: results.filter((result) => result.status === "delivered").length,
    failed: results.filter((result) => result.status === "failed").length,
    limit: deliveryLimit,
    maxAttempts: attemptLimit,
    results,
  }
}
