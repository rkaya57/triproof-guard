import { db } from "@/lib/db/prisma"
import { webhookHeaders } from "@/lib/webhooks/sign"

type TeamPolicyWebhookInput = {
  userId: string
  action: "REVIEW" | "BLOCK"
  target: string
  source: string
  chain?: string | null
  matches: Array<{ policyId: string; policyName: string; ruleId: string; ruleType: string; action: string; reason: string }>
}

function eventEnabled(eventTypes: unknown, event: string) {
  return !Array.isArray(eventTypes) || eventTypes.includes(event) || eventTypes.includes("*")
}

export async function deliverTeamPolicyWebhook(input: TeamPolicyWebhookInput) {
  const event = input.action === "BLOCK" ? "policy.blocked" : "policy.review"
  const endpoints = await db.webhookEndpoint.findMany({ where: { userId: input.userId, isActive: true } })
  const payload = {
    event,
    target: input.target,
    source: input.source,
    chain: input.chain ?? "unknown",
    action: input.action,
    matchedPolicies: input.matches.map((match) => ({
      policyId: match.policyId,
      policyName: match.policyName,
      ruleId: match.ruleId,
      ruleType: match.ruleType,
      action: match.action,
      reason: match.reason,
    })),
    occurredAt: new Date().toISOString(),
  }
  const payloadString = JSON.stringify(payload)
  let delivered = 0

  for (const endpoint of endpoints) {
    if (!eventEnabled(endpoint.eventTypes, event)) continue
    const delivery = await db.webhookDelivery.create({
      data: { endpointId: endpoint.id, eventType: event, status: "pending", requestPayload: payload },
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
        data: { status: "failed", attemptCount: 1, errorMessage: error instanceof Error ? error.message : "Webhook delivery failed" },
      })
    }
  }
  return { event, delivered }
}
