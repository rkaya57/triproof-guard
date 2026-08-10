import assert from "node:assert/strict"
import test from "node:test"

import { resetPhishingDatabaseCacheForTests } from "@/lib/scamguard/providers/phishing-database"
import { observeScamGuardV2 } from "./evidence-fusion"

const originalFetch = globalThis.fetch
const originalEnabled = process.env.PHISHING_DATABASE_ENABLED
const originalFeedUrl = process.env.PHISHING_DATABASE_FEED_URL
const originalTokensKey = process.env.TOKENS_XYZ_API_KEY

function restore() {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.PHISHING_DATABASE_ENABLED
  else process.env.PHISHING_DATABASE_ENABLED = originalEnabled
  if (originalFeedUrl === undefined) delete process.env.PHISHING_DATABASE_FEED_URL
  else process.env.PHISHING_DATABASE_FEED_URL = originalFeedUrl
  if (originalTokensKey === undefined) delete process.env.TOKENS_XYZ_API_KEY
  else process.env.TOKENS_XYZ_API_KEY = originalTokensKey
  resetPhishingDatabaseCacheForTests()
}

test.afterEach(restore)

function structuredDelegateApproval() {
  return JSON.stringify({
    transaction: {
      instructions: [
        {
          program: "spl-token",
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          parsed: {
            type: "approveChecked",
            info: {
              delegate: "Delegate111111111111111111111111111111111",
              amount: "100",
            },
          },
        },
      ],
    },
  })
}

test("real structured Solana delegate approval reaches V2 transaction-impact evidence", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "false"
  delete process.env.TOKENS_XYZ_API_KEY

  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "solana",
    value: structuredDelegateApproval(),
  })

  assert.equal(observation.base.metadata.decodedIntent?.category, "approval")
  assert.equal(observation.evidence.transactionImpact?.action, "approval")
  assert.ok(observation.evidence.transactionImpact?.capabilities.includes("delegate_rights"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TX_DELEGATE_RIGHTS"))
  assert.deepEqual(observation.proposedAssessment.independentFamilies, ["transaction_impact"])
  assert.equal(observation.proposedAssessment.activationGate, "insufficient")
  assert.equal(observation.summary.decisionChanged, false)
})

test("Solana delegate approval plus phishing and brand evidence reaches three-family critical shadow proposal", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "true"
  process.env.PHISHING_DATABASE_FEED_URL = "https://phishing.example/active.txt"
  delete process.env.TOKENS_XYZ_API_KEY

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
    type: "transaction",
    chain: "solana",
    sourceUrl: "https://phantorn.app/claim",
    value: structuredDelegateApproval(),
  })

  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TX_DELEGATE_RIGHTS"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_ACTIVE_PHISHING_FEED_MATCH"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_BRAND_TYPOSQUAT"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("transaction_impact"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("threat_intelligence"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("brand_impersonation"))
  assert.equal(observation.proposedAssessment.activationGate, "corroborated")
  assert.equal(observation.proposedAssessment.proposedRiskLevel, "CRITICAL")
  assert.equal(observation.summary.decisionChanged, false)
})

test("ordinary extension-provided Solana transfer remains visible without maliciousness score", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "false"
  delete process.env.TOKENS_XYZ_API_KEY

  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "solana",
    value: JSON.stringify({
      kind: "solana_wallet_request",
      method: "signTransaction",
      instructions: [{
        programId: "11111111111111111111111111111111",
        programLabel: "System Program",
        type: "transfer",
        keyCount: 2,
      }],
      serializedTransaction: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }),
  })

  assert.equal(observation.base.metadata.decodedIntent?.category, "transfer")
  assert.equal(observation.evidence.transactionImpact?.action, "transfer")
  assert.ok(observation.evidence.transactionImpact?.capabilities.includes("asset_outflow"))
  assert.equal(observation.proposedSignals.filter((signal) => signal.code.startsWith("V2_TX_")).length, 0)
  assert.equal(observation.proposedAssessment.evidenceScore, 0)
})
