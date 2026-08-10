import assert from "node:assert/strict"
import test from "node:test"

import { resetPhishingDatabaseCacheForTests } from "@/lib/scamguard/providers/phishing-database"
import { observeScamGuardV2 } from "./evidence-fusion"

const originalFetch = globalThis.fetch
const originalEnabled = process.env.PHISHING_DATABASE_ENABLED
const originalUrl = process.env.PHISHING_DATABASE_FEED_URL

function restore() {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.PHISHING_DATABASE_ENABLED
  else process.env.PHISHING_DATABASE_ENABLED = originalEnabled
  if (originalUrl === undefined) delete process.env.PHISHING_DATABASE_FEED_URL
  else process.env.PHISHING_DATABASE_FEED_URL = originalUrl
  resetPhishingDatabaseCacheForTests()
}

test.afterEach(restore)

test("brand typosquat and independent phishing feed converge into a corroborated observe-only proposal", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "true"
  process.env.PHISHING_DATABASE_FEED_URL = "https://phishing.example/active.txt"

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url === "https://phishing.example/active.txt") {
      return new Response("phantorn.app\n", { status: 200 })
    }
    if (url.includes("eth-phishing-detect")) {
      return new Response(JSON.stringify({ blacklist: [], fuzzylist: [], whitelist: [] }), { status: 200 })
    }
    return new Response("", { status: 404 })
  }

  const observation = await observeScamGuardV2({
    type: "url",
    value: "https://phantorn.app/claim",
    chain: "solana",
  })

  assert.equal(observation.summary.decisionChanged, false)
  assert.equal(observation.proposedAssessment.decisionChanged, false)
  assert.equal(observation.evidence.phishingDatabase?.matched, true)
  assert.ok(observation.evidence.brandImpersonation?.some((finding) => finding.brand === "phantom" && finding.matchType === "typosquat"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_ACTIVE_PHISHING_FEED_MATCH"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_BRAND_TYPOSQUAT"))
  assert.equal(observation.proposedAssessment.activationGate, "corroborated")
  assert.equal(observation.proposedAssessment.confidence, "HIGH")
  assert.ok(["HIGH_RISK", "CRITICAL"].includes(observation.proposedAssessment.proposedRiskLevel))
})
