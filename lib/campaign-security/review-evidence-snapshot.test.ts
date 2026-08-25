import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildReviewEvidenceSnapshot,
  canonicalReviewFundingEvidenceByWallet,
  REVIEW_EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/campaign-security/review-evidence-snapshot"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"

function relationship(
  overrides: Partial<FundingDecisionRelationshipInput> = {},
): FundingDecisionRelationshipInput {
  return {
    relationshipKey: "same-funder:0xabc:0xdef",
    kind: "SAME_FUNDER",
    chain: "Ethereum",
    sourceAddress: "0xABC0000000000000000000000000000000000001",
    targetAddress: "0xDEF0000000000000000000000000000000000002",
    viaAddress: "0xBAD0000000000000000000000000000000000003",
    hopCount: 1,
    cohortSize: 7,
    confidence: 0.94,
    riskBearing: true,
    suppressionReason: null,
    evidenceEventKeys: ["event-1", "event-2"],
    observedAt: new Date("2026-08-21T10:00:00.000Z"),
    metadata: {
      knownBadFundingSource: true,
      fundingWindowHours: 2.5,
      timestampCoverage: 1,
    },
    ...overrides,
  }
}

describe("review evidence snapshot", () => {
  it("freezes deterministic decision context without recomputing it", () => {
    const snapshot = buildReviewEvidenceSnapshot(
      {
        walletAddress: "0xABC0000000000000000000000000000000000001",
        chain: "Ethereum",
        status: "manual_review",
        riskScore: 71,
        riskLevel: "high",
        recommendedAction: "manual_review",
      },
      [],
      new Date("2026-08-21T11:00:00.000Z"),
    )

    assert.equal(snapshot.schemaVersion, REVIEW_EVIDENCE_SNAPSHOT_SCHEMA_VERSION)
    assert.equal(snapshot.capturedAt, "2026-08-21T11:00:00.000Z")
    assert.equal(snapshot.supplementalOnly, true)
    assert.deepEqual(snapshot.canonicalFundingEvidence, [])
    assert.deepEqual(snapshot.decisionContext, {
      status: "manual_review",
      riskScore: 71,
      riskLevel: "high",
      recommendedAction: "manual_review",
    })
    assert.deepEqual(snapshot.boundary, {
      reviewerActionIsHumanOverride: true,
      decisionStateRecomputedFromSnapshot: false,
      riskScoreRecomputedFromSnapshot: false,
      policyReevaluatedFromSnapshot: false,
    })
  })

  it("maps shared canonical funding evidence onto both campaign wallets", () => {
    const byWallet = canonicalReviewFundingEvidenceByWallet([relationship()])
    const left = byWallet.get("ethereum:0xabc0000000000000000000000000000000000001") ?? []
    const right = byWallet.get("ethereum:0xdef0000000000000000000000000000000000002") ?? []

    assert.equal(left.length, 1)
    assert.equal(right.length, 1)
    assert.equal(left[0]?.relationshipKey, "same-funder:0xabc:0xdef")
    assert.equal(left[0]?.relationshipConfidence, 0.94)
    assert.deepEqual(left[0]?.evidenceEventKeys, ["event-1", "event-2"])
    assert.equal(left[0]?.observedAt, "2026-08-21T10:00:00.000Z")
    assert.ok(left[0]?.code.startsWith("CANONICAL_"))
  })

  it("preserves Solana base58 case when building reviewer evidence keys", () => {
    const source = "AbCDefGhijkLMNopQRstuVWXyz123456789"
    const target = "aBcDefGhijkLMNopQRstuVWXyz123456789"
    const byWallet = canonicalReviewFundingEvidenceByWallet([
      relationship({
        relationshipKey: "solana-case-test",
        chain: "Solana",
        sourceAddress: source,
        targetAddress: target,
        viaAddress: "FundEr111111111111111111111111111111111",
      }),
    ])

    assert.equal(byWallet.get(`solana:${source}`)?.length, 1)
    assert.equal(byWallet.get(`solana:${target}`)?.length, 1)
    assert.notEqual(`solana:${source}`, `solana:${target}`)
  })

  it("keeps neutral infrastructure context in the immutable reviewer snapshot", () => {
    const byWallet = canonicalReviewFundingEvidenceByWallet([
      relationship({
        relationshipKey: "neutral-bridge",
        kind: "FUNDED_BY",
        sourceAddress: "0xABC0000000000000000000000000000000000001",
        targetAddress: "0xBRIDGE00000000000000000000000000000000001",
        viaAddress: null,
        riskBearing: false,
        suppressionReason: "neutral_infrastructure_funder",
        metadata: {},
      }),
    ])
    const evidence = byWallet.get("ethereum:0xabc0000000000000000000000000000000000001") ?? []

    assert.equal(evidence.length, 1)
    assert.equal(evidence[0]?.effect, "neutralizing_context")
    assert.ok(evidence[0]?.code.includes("INFRASTRUCTURE"))
  })

  it("omits uncorroborated unknown shared funding from reviewer evidence", () => {
    const byWallet = canonicalReviewFundingEvidenceByWallet([
      relationship({
        relationshipKey: "unknown-shared-funder",
        riskBearing: false,
        suppressionReason: null,
        metadata: {},
      }),
    ])

    assert.equal(byWallet.size, 0)
  })
})
