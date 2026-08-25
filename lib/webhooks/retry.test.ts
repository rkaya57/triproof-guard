import assert from "node:assert/strict"
import test from "node:test"

import {
  assertWebhookRetryAllowed,
  WebhookRetryConflictError,
} from "@/lib/webhooks/retry"

function conflictCode(fn: () => void) {
  try {
    fn()
    return null
  } catch (error) {
    assert.ok(error instanceof WebhookRetryConflictError)
    return error.code
  }
}

test("failed delivery on an active endpoint remains manually retryable", () => {
  assert.doesNotThrow(() => assertWebhookRetryAllowed({ status: "failed", isActive: true, attemptCount: 3 }))
})

test("pending delivery is treated as in-flight instead of manually replayable", () => {
  assert.equal(
    conflictCode(() => assertWebhookRetryAllowed({ status: "pending", isActive: true, attemptCount: 0 })),
    "WEBHOOK_RETRY_IN_PROGRESS",
  )
})

test("delivered webhook cannot be manually replayed", () => {
  assert.equal(
    conflictCode(() => assertWebhookRetryAllowed({ status: "delivered", isActive: true, attemptCount: 1 })),
    "WEBHOOK_ALREADY_DELIVERED",
  )
})

test("paused endpoint must be resumed before a manual retry", () => {
  assert.equal(
    conflictCode(() => assertWebhookRetryAllowed({ status: "failed", isActive: false, attemptCount: 1 })),
    "WEBHOOK_ENDPOINT_PAUSED",
  )
})

test("manual retry cannot exceed the absolute delivery attempt cap", () => {
  assert.equal(
    conflictCode(() => assertWebhookRetryAllowed({ status: "failed", isActive: true, attemptCount: 10 })),
    "WEBHOOK_MAX_ATTEMPTS_REACHED",
  )
})
