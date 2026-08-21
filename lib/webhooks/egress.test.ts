import assert from "node:assert/strict"
import test from "node:test"

import {
  isAllowedWebhookHostname,
  isPublicWebhookAddress,
  resolveWebhookEgressTarget,
  WebhookEgressBlockedError,
  webhookDeliveryErrorMessage,
} from "@/lib/webhooks/egress"

test("webhook egress rejects private, loopback, link-local, and metadata addresses", () => {
  assert.equal(isPublicWebhookAddress("1.1.1.1"), true)
  assert.equal(isPublicWebhookAddress("2606:4700:4700::1111"), true)
  assert.equal(isPublicWebhookAddress("10.0.0.1"), false)
  assert.equal(isPublicWebhookAddress("127.0.0.1"), false)
  assert.equal(isPublicWebhookAddress("169.254.169.254"), false)
  assert.equal(isPublicWebhookAddress("::1"), false)
  assert.equal(isPublicWebhookAddress("fc00::1"), false)
})

test("webhook hostname policy blocks local aliases and private literals", () => {
  assert.equal(isAllowedWebhookHostname("localhost"), false)
  assert.equal(isAllowedWebhookHostname("worker.local"), false)
  assert.equal(isAllowedWebhookHostname("service.internal"), false)
  assert.equal(isAllowedWebhookHostname("10.20.30.40"), false)
  assert.equal(isAllowedWebhookHostname("[::1]"), false)
  assert.equal(isAllowedWebhookHostname("hooks.example.com"), true)
})

test("delivery-time DNS validation fails closed when any answer is private", async () => {
  await assert.rejects(
    resolveWebhookEgressTarget("https://hooks.example.com/triproof", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]),
    (error) => error instanceof WebhookEgressBlockedError && /private|local|reserved|non-routable/i.test(error.message),
  )
})

test("delivery-time DNS validation fails closed when the hostname has no public answers", async () => {
  await assert.rejects(
    resolveWebhookEgressTarget("https://hooks.example.com/triproof", async () => []),
    (error) => error instanceof WebhookEgressBlockedError && /did not resolve/i.test(error.message),
  )
})

test("public-only DNS answers produce a deterministic pinned target", async () => {
  const target = await resolveWebhookEgressTarget("https://hooks.example.com/triproof", async () => [
    { address: "2606:4700:4700::1111", family: 6 },
    { address: "1.1.1.1", family: 4 },
  ])

  assert.equal(target.url.hostname, "hooks.example.com")
  assert.deepEqual(target.pinnedAddress, { address: "1.1.1.1", family: 4 })
  assert.equal(target.addresses.length, 2)
})

test("redirect responses are represented as blocked delivery failures", () => {
  assert.equal(
    webhookDeliveryErrorMessage({ status: 302, ok: false, body: "", redirectBlocked: true }),
    "Webhook redirect blocked (HTTP 302)",
  )
  assert.equal(
    webhookDeliveryErrorMessage({ status: 500, ok: false, body: "", redirectBlocked: false }),
    "HTTP 500",
  )
  assert.equal(
    webhookDeliveryErrorMessage({ status: 204, ok: true, body: "", redirectBlocked: false }),
    null,
  )
})
