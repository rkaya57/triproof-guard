import assert from "node:assert/strict"
import test from "node:test"

import { summarizeWebhookHealth } from "@/lib/webhooks/observability"

function delivery(status: string, iso: string, deliveredAt?: string) {
  return {
    status,
    createdAt: new Date(iso),
    deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
  }
}

test("active endpoint with no delivery history is idle", () => {
  const health = summarizeWebhookHealth([], true)
  assert.equal(health.state, "idle")
  assert.equal(health.recentSuccessRate, null)
  assert.equal(health.consecutiveFailures, 0)
})

test("paused endpoint remains paused regardless of recent delivery results", () => {
  const health = summarizeWebhookHealth([
    delivery("failed", "2026-08-21T10:00:00Z"),
    delivery("failed", "2026-08-21T09:00:00Z"),
    delivery("failed", "2026-08-21T08:00:00Z"),
  ], false)
  assert.equal(health.state, "paused")
  assert.equal(health.consecutiveFailures, 3)
})

test("successful terminal history is healthy and reports exact recent rate", () => {
  const health = summarizeWebhookHealth([
    delivery("delivered", "2026-08-21T10:00:00Z", "2026-08-21T10:00:01Z"),
    delivery("delivered", "2026-08-21T09:00:00Z", "2026-08-21T09:00:01Z"),
  ], true)
  assert.equal(health.state, "healthy")
  assert.equal(health.recentSuccessRate, 1)
  assert.equal(health.lastSuccessAt, "2026-08-21T10:00:01.000Z")
})

test("one recent failure degrades endpoint health without declaring it failing", () => {
  const health = summarizeWebhookHealth([
    delivery("failed", "2026-08-21T10:00:00Z"),
    delivery("delivered", "2026-08-21T09:00:00Z", "2026-08-21T09:00:01Z"),
  ], true)
  assert.equal(health.state, "degraded")
  assert.equal(health.consecutiveFailures, 1)
  assert.equal(health.recentSuccessRate, 0.5)
})

test("three consecutive terminal failures mark an active endpoint failing", () => {
  const health = summarizeWebhookHealth([
    delivery("failed", "2026-08-21T10:00:00Z"),
    delivery("pending", "2026-08-21T09:30:00Z"),
    delivery("failed", "2026-08-21T09:00:00Z"),
    delivery("failed", "2026-08-21T08:00:00Z"),
    delivery("delivered", "2026-08-21T07:00:00Z", "2026-08-21T07:00:01Z"),
  ], true)
  assert.equal(health.state, "failing")
  assert.equal(health.consecutiveFailures, 3)
  assert.equal(health.recentFailures, 3)
  assert.equal(health.recentPending, 1)
})

test("health calculation is bounded to the requested recent window", () => {
  const health = summarizeWebhookHealth([
    delivery("delivered", "2026-08-21T10:00:00Z", "2026-08-21T10:00:01Z"),
    delivery("failed", "2026-08-21T09:00:00Z"),
    delivery("failed", "2026-08-21T08:00:00Z"),
  ], true, 2)
  assert.equal(health.recentAttempts, 2)
  assert.equal(health.recentFailures, 1)
  assert.equal(health.recentSuccessRate, 0.5)
})
