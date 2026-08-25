import assert from "node:assert/strict"
import test from "node:test"

import {
  CAMPAIGN_WEBHOOK_EVENTS,
  SUPPORTED_WEBHOOK_EVENTS,
  buildAnalysisWebhookEvents,
  buildLifecycleChangedWebhook,
  buildPolicyChangedWebhook,
  campaignWebhookEventId,
  webhookEventEnabled,
} from "@/lib/webhooks/campaign-events"

function analysisEvents(review = 2) {
  return buildAnalysisWebhookEvents({
    campaignId: "campaign_1",
    campaignName: "Genesis Rewards",
    analysisId: "analysis_1",
    chain: "Base",
    campaignType: "Airdrop",
    status: "completed",
    totalWallets: 10,
    approved: 6,
    review,
    excluded: 2,
    averageRiskScore: 31.5,
    suspiciousClusters: 1,
    createdAt: new Date("2026-08-21T12:00:00.000Z"),
    completedAt: new Date("2026-08-21T12:05:00.000Z"),
    origin: "https://triproofprotocol.com",
  })
}

test("campaign analysis webhook ids are deterministic per analysis event", () => {
  assert.equal(
    campaignWebhookEventId("analysis.completed", "analysis_1"),
    campaignWebhookEventId("analysis.completed", "analysis_1"),
  )
  assert.notEqual(
    campaignWebhookEventId("analysis.completed", "analysis_1"),
    campaignWebhookEventId("decision_package.ready", "analysis_1"),
  )
})

test("analysis.completed preserves legacy project fields and adds campaign-native links", () => {
  const { completed } = analysisEvents()
  assert.equal(completed.projectId, "campaign_1")
  assert.equal(completed.campaignId, "campaign_1")
  assert.equal(completed.projectName, "Genesis Rewards")
  assert.equal(completed.totals.grayZoneManualReview, 2)
  assert.match(completed.links.decisions, /\/api\/v2\/campaigns\/campaign_1\/decisions$/)
})

test("review_required is emitted only when a wallet review queue exists", () => {
  assert.equal(analysisEvents(0).reviewRequired, null)
  assert.equal(analysisEvents(3).reviewRequired?.review.walletCount, 3)
})

test("decision package webhook is explicitly read-only", () => {
  const { decisionPackage } = analysisEvents()
  assert.equal(decisionPackage.decisionPackage.readOnly, true)
  assert.match(decisionPackage.decisionPackage.formatCsv, /format=csv$/)
})

test("policy and lifecycle events preserve non-recomputation boundaries", () => {
  const policy = buildPolicyChangedWebhook({
    campaignId: "campaign_1",
    previousPreset: "balanced",
    previousVersion: 1,
    preset: "strict",
    version: 2,
    policyHash: "hash_2",
    rationale: "Higher-value reward round",
    actorId: "user_1",
    actorName: "Analyst",
    source: "api-v2",
    occurredAt: new Date("2026-08-21T12:10:00.000Z"),
  })
  assert.equal(policy.policy.appliesToFutureRuns, true)
  assert.equal(policy.policy.recomputedStoredDecisions, false)

  const lifecycle = buildLifecycleChangedWebhook({
    campaignId: "campaign_1",
    from: "active",
    to: "paused",
    actorId: "user_1",
    actorName: "Analyst",
    source: "dashboard-v2",
    occurredAt: new Date("2026-08-21T12:11:00.000Z"),
  })
  assert.equal(lifecycle.boundaries.changedWalletDecisions, false)
  assert.equal(lifecycle.boundaries.changedPolicy, false)
})

test("campaign subscriptions coexist with existing team policy webhook events", () => {
  for (const event of CAMPAIGN_WEBHOOK_EVENTS) assert.ok(SUPPORTED_WEBHOOK_EVENTS.includes(event))
  assert.ok(SUPPORTED_WEBHOOK_EVENTS.includes("policy.blocked"))
  assert.ok(SUPPORTED_WEBHOOK_EVENTS.includes("policy.review"))
  assert.equal(webhookEventEnabled(["decision_package.ready"], "decision_package.ready"), true)
  assert.equal(webhookEventEnabled(["analysis.completed"], "decision_package.ready"), false)
  assert.equal(webhookEventEnabled(["*"], "campaign.policy_changed"), true)
})
