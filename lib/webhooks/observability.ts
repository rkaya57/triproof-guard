export type WebhookHealthState = "healthy" | "degraded" | "failing" | "idle" | "paused"

export type WebhookDeliveryObservation = {
  id?: string
  status: string
  statusCode?: number | null
  errorMessage?: string | null
  attemptCount?: number
  createdAt: Date
  deliveredAt?: Date | null
}

export type WebhookHealthSummary = {
  state: WebhookHealthState
  recentAttempts: number
  recentSuccesses: number
  recentFailures: number
  recentPending: number
  recentSuccessRate: number | null
  consecutiveFailures: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

export function summarizeWebhookHealth(
  deliveries: readonly WebhookDeliveryObservation[],
  isActive: boolean,
  recentLimit = 20,
): WebhookHealthSummary {
  const recent = [...deliveries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, Math.max(1, recentLimit))

  const successes = recent.filter((delivery) => delivery.status === "delivered")
  const failures = recent.filter((delivery) => delivery.status === "failed")
  const pending = recent.filter((delivery) => delivery.status === "pending")
  const terminalAttempts = successes.length + failures.length

  let consecutiveFailures = 0
  for (const delivery of recent) {
    if (delivery.status === "failed") {
      consecutiveFailures += 1
      continue
    }
    if (delivery.status === "pending") continue
    break
  }

  const lastAttempt = recent[0] ?? null
  const lastSuccess = recent.find((delivery) => delivery.status === "delivered") ?? null
  const lastFailure = recent.find((delivery) => delivery.status === "failed") ?? null

  let state: WebhookHealthState
  if (!isActive) state = "paused"
  else if (recent.length === 0) state = "idle"
  else if (consecutiveFailures >= 3) state = "failing"
  else if (failures.length > 0 || pending.length > 0) state = "degraded"
  else state = "healthy"

  return {
    state,
    recentAttempts: recent.length,
    recentSuccesses: successes.length,
    recentFailures: failures.length,
    recentPending: pending.length,
    recentSuccessRate: terminalAttempts > 0 ? Number((successes.length / terminalAttempts).toFixed(4)) : null,
    consecutiveFailures,
    lastAttemptAt: lastAttempt?.createdAt.toISOString() ?? null,
    lastSuccessAt: lastSuccess?.deliveredAt?.toISOString() ?? lastSuccess?.createdAt.toISOString() ?? null,
    lastFailureAt: lastFailure?.createdAt.toISOString() ?? null,
  }
}

export function serializeWebhookDelivery(delivery: WebhookDeliveryObservation & {
  id: string
  eventType?: string
  responseBody?: string | null
  analysisId?: string | null
}) {
  return {
    id: delivery.id,
    eventType: delivery.eventType ?? null,
    status: delivery.status,
    statusCode: delivery.statusCode ?? null,
    errorMessage: delivery.errorMessage ?? null,
    responseBody: delivery.responseBody ?? null,
    attemptCount: delivery.attemptCount ?? 0,
    analysisId: delivery.analysisId ?? null,
    createdAt: delivery.createdAt.toISOString(),
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
  }
}
