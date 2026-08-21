import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeWebhookDescription,
  normalizeWebhookEvents,
  normalizeWebhookUrl,
} from "@/lib/webhooks/management"

test("production webhook URLs require HTTPS and reject embedded credentials", () => {
  assert.equal(normalizeWebhookUrl("https://example.com/hooks#fragment", { production: true }), "https://example.com/hooks")
  assert.equal(normalizeWebhookUrl("http://example.com/hooks", { production: true }), null)
  assert.equal(normalizeWebhookUrl("https://user:pass@example.com/hooks", { production: true }), null)
})

test("webhook registration rejects local and private destinations before delivery", () => {
  assert.equal(normalizeWebhookUrl("http://localhost:3001/hook", { production: false }), null)
  assert.equal(normalizeWebhookUrl("https://127.0.0.1/hook", { production: true }), null)
  assert.equal(normalizeWebhookUrl("https://169.254.169.254/latest/meta-data", { production: true }), null)
  assert.equal(normalizeWebhookUrl("https://service.internal/hook", { production: true }), null)
})

test("development webhook URLs may use HTTP only for public destinations", () => {
  assert.equal(normalizeWebhookUrl("http://example.com/hook", { production: false }), "http://example.com/hook")
  assert.equal(normalizeWebhookUrl("ftp://example.com/hook", { production: false }), null)
})

test("webhook events are deduplicated and limited to the shared supported contract", () => {
  assert.deepEqual(
    normalizeWebhookEvents(["analysis.completed", "analysis.completed", "decision_package.ready", "unknown.event"]),
    ["analysis.completed", "decision_package.ready"],
  )
  assert.deepEqual(normalizeWebhookEvents(undefined, { fallback: ["analysis.completed"] }), ["analysis.completed"])
  assert.equal(normalizeWebhookEvents(["unknown.event"]), null)
})

test("webhook descriptions are bounded and can be explicitly cleared", () => {
  assert.equal(normalizeWebhookDescription("  Production endpoint  "), "Production endpoint")
  assert.equal(normalizeWebhookDescription("   "), null)
  assert.equal(normalizeWebhookDescription(null), null)
  assert.equal(normalizeWebhookDescription(42), undefined)
  assert.equal(normalizeWebhookDescription("x".repeat(250))?.length, 200)
})
