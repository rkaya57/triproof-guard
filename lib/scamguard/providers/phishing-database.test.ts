import assert from "node:assert/strict"
import test from "node:test"

import { inspectPhishingDatabase, resetPhishingDatabaseCacheForTests } from "./phishing-database"

const originalFetch = globalThis.fetch
const originalEnabled = process.env.PHISHING_DATABASE_ENABLED
const originalFeedUrl = process.env.PHISHING_DATABASE_FEED_URL
const originalBackoff = process.env.PHISHING_DATABASE_FAILURE_BACKOFF_MS

function restore() {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.PHISHING_DATABASE_ENABLED
  else process.env.PHISHING_DATABASE_ENABLED = originalEnabled
  if (originalFeedUrl === undefined) delete process.env.PHISHING_DATABASE_FEED_URL
  else process.env.PHISHING_DATABASE_FEED_URL = originalFeedUrl
  if (originalBackoff === undefined) delete process.env.PHISHING_DATABASE_FAILURE_BACKOFF_MS
  else process.env.PHISHING_DATABASE_FAILURE_BACKOFF_MS = originalBackoff
  resetPhishingDatabaseCacheForTests()
}

test.afterEach(restore)

test("Phishing.Database matches active phishing domains and their subdomains", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "true"
  globalThis.fetch = async () => new Response("evil.example\nphish.example.org\n", { status: 200 })

  const direct = await inspectPhishingDatabase("evil.example")
  const subdomain = await inspectPhishingDatabase("claim.phish.example.org")

  assert.equal(direct.status, "available")
  assert.equal(direct.matched, true)
  assert.equal(subdomain.matched, true)
})

test("Phishing.Database provider can be disabled without network access", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "false"
  let called = false
  globalThis.fetch = async () => {
    called = true
    return new Response("", { status: 200 })
  }

  const result = await inspectPhishingDatabase("example.com")
  assert.equal(result.status, "disabled")
  assert.equal(result.matched, false)
  assert.equal(called, false)
})

test("Phishing.Database provider degrades safely on upstream failure", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "true"
  globalThis.fetch = async () => new Response("upstream error", { status: 503 })

  const result = await inspectPhishingDatabase("example.com")
  assert.equal(result.status, "unavailable")
  assert.equal(result.matched, false)
  assert.match(result.error ?? "", /HTTP 503/)
})

test("Phishing.Database failure backoff prevents repeated upstream hammering", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "true"
  process.env.PHISHING_DATABASE_FAILURE_BACKOFF_MS = "60000"
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response("upstream error", { status: 503 })
  }

  const first = await inspectPhishingDatabase("example.com")
  const second = await inspectPhishingDatabase("another.example.com")

  assert.equal(first.status, "unavailable")
  assert.equal(second.status, "unavailable")
  assert.equal(calls, 1)
  assert.match(second.error ?? "", /temporarily backed off/)
})
