import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import {
  type CampaignWebhookEventType,
  webhookEventEnabled,
} from "@/lib/webhooks/campaign-events"
import { webhookHeaders } from "@/lib/webhooks/sign"

type CampaignWebhookPayload = {
  event: CampaignWebhookEventType
  eventId: string
  campaignId: string
  [key: string]: unknown
}

export async function deliverCampaignWebhookEvent(input: {
  userId: string
  payload: CampaignWebhookPayload
  analysisId?: string | null
  dedupeAnalysisEvent?: boolean
}) {
  const endpoints = await db.webhookEndpoint.findMany({
    where: { userId: input.userId, isActive: true },
  })
  const payloadString = JSON.stringify(input.payload)
  let delivered = 0
  let skipped = 0

  for (const endpoint of endpoints) {
    if (!webhookEventEnabled(endpoint.eventTypes, input.payload.event)) continue

    if (input.analysisId && input.dedupeAnalysisEvent !== false) {
      const existing = await db.webhookDelivery.findFirst({
        where: {
          endpointId: endpoint.id,
          analysisId: input.analysisId,
          eventType: input.payload.event,
        },
        select: { id: true },
      })
      if (existing) {
        skipped += 1
        continue
      }
    }

    const delivery = await db.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        analysisId: input.analysisId ?? null,
        eventType: input.payload.event,
        status: "pending",
        requestPayload: input.payload as Prisma.InputJsonValue,
      },
    })

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: webhookHeaders(payloadString, endpoint.secret),
        body: payloadString,
      })
      const responseBody = (await response.text().catch(() => "")).slice(0, 4000)
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.ok ? "delivered" : "failed",
          statusCode: response.status,
          responseBody,
          attemptCount: 1,
          deliveredAt: response.ok ? new Date() : null,
          errorMessage: response.ok ? null : `HTTP ${response.status}`,
        },
      })
      if (response.ok) delivered += 1
    } catch (error) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          attemptCount: 1,
          errorMessage: error instanceof Error ? error.message : "Webhook delivery failed",
        },
      })
    }
  }

  return { event: input.payload.event, delivered, skipped }
}
