import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import {
  sendWebhookRequest,
  webhookDeliveryErrorMessage,
} from "@/lib/webhooks/egress"
import { webhookHeaders } from "@/lib/webhooks/sign"

const DEFAULT_WEBHOOK_RETRY_LIMIT = Number.parseInt(process.env.WEBHOOK_RETRY_LIMIT ?? "10", 10)
const DEFAULT_WEBHOOK_MAX_ATTEMPTS = Number.parseInt(process.env.WEBHOOK_MAX_ATTEMPTS ?? "3", 10)
export const ABSOLUTE_WEBHOOK_MAX_ATTEMPTS = 10

type DeliveryWithEndpoint = {
  id: string
  endpointId: string
  requestPayload: Prisma.JsonValue
  attemptCount: number
  status: string
  endpoint: {
    url: string
    secret: string
    isActive: boolean
  }
}

export class WebhookRetryConflictError extends Error {
  constructor(
    message: string,
    readonly code:
      | "WEBHOOK_ALREADY_DELIVERED"
      | "WEBHOOK_ENDPOINT_PAUSED"
      | "WEBHOOK_MAX_ATTEMPTS_REACHED"
      | "WEBHOOK_RETRY_IN_PROGRESS",
  ) {
    super(message)
    this.name = "WebhookRetryConflictError"
  }
}

export function assertWebhookRetryAllowed(input: {
  status: string
  isActive: boolean
  attemptCount: number
}) {
  if (input.status === "delivered") {
    throw new WebhookRetryConflictError("Delivered webhooks cannot be sent again.", "WEBHOOK_ALREADY_DELIVERED")
  }
  if (!input.isActive) {
    throw new WebhookRetryConflictError("Resume the webhook endpoint before retrying delivery.", "WEBHOOK_ENDPOINT_PAUSED")
  }
  if (input.attemptCount >= ABSOLUTE_WEBHOOK_MAX_ATTEMPTS) {
    throw new WebhookRetryConflictError("Webhook delivery has reached the maximum attempt count.", "WEBHOOK_MAX_ATTEMPTS_REACHED")
  }
}

function safeLimit(value = DEFAULT_WEBHOOK_RETRY_LIMIT) {
  if (!Number.isFinite(value)) return 10
  return Math.min(50, Math.max(1, value))
}

function safeMaxAttempts(value = DEFAULT_WEBHOOK_MAX_ATTEMPTS) {
  if (!Number.isFinite(value)) return 3
  return Math.min(ABSOLUTE_WEBHOOK_MAX_ATTEMPTS, Math.max(1, value))
}

async function claimWebhookDeliveryAttempt(delivery: DeliveryWithEndpoint) {
  const claimed = await db.webhookDelivery.updateMany({
    where: {
      id: delivery.id,
      attemptCount: delivery.attemptCount,
      status: { in: ["pending", "failed"] },
    },
    data: {
      attemptCount: { increment: 1 },
      status: "pending",
    },
  })
  return claimed.count === 1
}

async function executeClaimedWebhookDeliveryAttempt(delivery: DeliveryWithEndpoint) {
  const payloadString = JSON.stringify(delivery.requestPayload)
  const attemptCount = delivery.attemptCount + 1

  try {
    const response = await sendWebhookRequest({
      url: delivery.endpoint.url,
      headers: webhookHeaders(payloadString, delivery.endpoint.secret),
      body: payloadString,
    })
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: response.ok ? "delivered" : "failed",
        statusCode: response.status,
        responseBody: response.body.slice(0, 4000),
        deliveredAt: response.ok ? new Date() : null,
        errorMessage: webhookDeliveryErrorMessage(response),
      },
    })
    return {
      id: delivery.id,
      endpointId: delivery.endpointId,
      status: response.ok ? "delivered" : "failed",
      statusCode: response.status,
      errorMessage: webhookDeliveryErrorMessage(response),
      attemptCount,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Webhook retry failed"
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        errorMessage,
      },
    })
    return {
      id: delivery.id,
      endpointId: delivery.endpointId,
      status: "failed",
      statusCode: null,
      errorMessage,
      attemptCount,
    }
  }
}

async function claimAndExecuteWebhookDeliveryAttempt(delivery: DeliveryWithEndpoint) {
  const claimed = await claimWebhookDeliveryAttempt(delivery)
  if (!claimed) return null
  return executeClaimedWebhookDeliveryAttempt(delivery)
}

export async function retrySingleWebhookDelivery(input: {
  userId: string
  endpointId: string
  deliveryId: string
}) {
  const delivery = await db.webhookDelivery.findFirst({
    where: {
      id: input.deliveryId,
      endpointId: input.endpointId,
      endpoint: { userId: input.userId },
    },
    include: { endpoint: true },
  })
  if (!delivery) return null

  assertWebhookRetryAllowed({
    status: delivery.status,
    isActive: delivery.endpoint.isActive,
    attemptCount: delivery.attemptCount,
  })

  const result = await claimAndExecuteWebhookDeliveryAttempt(delivery)
  if (!result) {
    throw new WebhookRetryConflictError(
      "Webhook delivery is already being retried or changed state.",
      "WEBHOOK_RETRY_IN_PROGRESS",
    )
  }
  return result
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
    const result = await claimAndExecuteWebhookDeliveryAttempt(delivery)
    if (result) results.push(result)
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
