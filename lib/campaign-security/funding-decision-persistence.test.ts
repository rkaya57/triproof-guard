import assert from "node:assert/strict"
import test from "node:test"

import {
  CAMPAIGN_DECISION_EVIDENCE_SCHEMA_VERSION,
  fundingDecisionPersistenceRows,
} from "@/lib/campaign-security/funding-decision-persistence"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"

const walletA = "0x1111111111111111111111111111111111111111"
const walletB = "0x2222222222222222222222222222222222222222"
const funder = "0x7777777777777777777777777777777777777777"

function relationship(
  overrides: Partial<FundingDecisionRelationshipInput> = {},
): FundingDecisionRelationshipInput {
  return {
    relationshipKey: "relationship-1",
    kind: "SAME_FUNDER",
    chain: "Ethereum",
    sourceAddress: walletA,
    targetAddress: walletB,
    viaAddress: funder,
    hopCount: 1,
    cohortSize: 4,
    confidence: 94,
    riskBearing: true,
    suppressionReason: null,
    evidenceEventKeys: ["event-1", "event-2"],
    observedAt: "2026-08-21T10:00:00.000Z",
    metadata: {
      burstFunding: true,
      fundingTimestampCoverage: 1,
      fundingSpreadHours: 4,
      knownBadFundingSource: false,
    },
    ...overrides,
  }
}

test("prepares one persisted evidence row for each wallet in a shared relationship", () => {
  const rows = fundingDecisionPersistenceRows([relationship()])

  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((row) => row.walletAddress).sort(),
    [walletA, walletB].sort(),
  )
  rows.forEach((row) => {
    assert.equal(row.fundingProvenance.length, 1)
    const evidence = row.fundingProvenance[0]
    assert.equal(evidence?.code, "CANONICAL_BURST_FUNDING_COHORT")
    assert.equal(evidence?.supplementalOnly, true)
    assert.equal(evidence?.reference.relationshipKey, "relationship-1")
    assert.deepEqual(evidence?.reference.evidenceEventKeys, ["event-1", "event-2"])
  })
})

test("does not persist an uncorroborated shared-funder relationship as decision evidence", () => {
  const rows = fundingDecisionPersistenceRows([
    relationship({
      riskBearing: false,
      suppressionReason: "same_funder_requires_temporal_or_other_corroboration",
      metadata: { burstFunding: false, knownBadFundingSource: false },
    }),
  ])

  assert.deepEqual(rows, [])
})

test("persists neutral infrastructure suppression as audit context", () => {
  const rows = fundingDecisionPersistenceRows([
    relationship({
      riskBearing: false,
      suppressionReason: "neutral_infrastructure_fanout",
      metadata: { neutralInfrastructure: true },
    }),
  ])

  assert.equal(rows.length, 2)
  assert.equal(
    rows[0]?.fundingProvenance[0]?.code,
    "CANONICAL_INFRASTRUCTURE_FUNDING_SUPPRESSED",
  )
  assert.equal(rows[0]?.fundingProvenance[0]?.effect, "neutralizing_context")
})

test("keeps Solana wallet casing distinct while EVM address keys are canonicalized", () => {
  const solanaUpper = "AbCdEfGhijkLMNoPqrstUVwxyz123456789ABCDEFGH"
  const solanaLower = solanaUpper.toLowerCase()

  const solanaRows = fundingDecisionPersistenceRows([
    relationship({
      relationshipKey: "sol-1",
      chain: "Solana",
      sourceAddress: solanaUpper,
      targetAddress: "TargetSolana1111111111111111111111111111111",
    }),
    relationship({
      relationshipKey: "sol-2",
      chain: "Solana",
      sourceAddress: solanaLower,
      targetAddress: "TargetSolana2222222222222222222222222222222",
    }),
  ])

  assert.ok(solanaRows.some((row) => row.walletAddress === solanaUpper))
  assert.ok(solanaRows.some((row) => row.walletAddress === solanaLower))

  const evmRows = fundingDecisionPersistenceRows([
    relationship({ relationshipKey: "evm-1", sourceAddress: walletA.toUpperCase() }),
    relationship({ relationshipKey: "evm-2", sourceAddress: walletA.toLowerCase() }),
  ])
  const sourceRows = evmRows.filter(
    (row) => row.walletAddress.toLowerCase() === walletA.toLowerCase(),
  )
  assert.equal(sourceRows.length, 1)
})

test("publishes a versioned audit envelope without claiming policy recomputation", () => {
  assert.equal(
    CAMPAIGN_DECISION_EVIDENCE_SCHEMA_VERSION,
    "tri-proof-campaign-decision-evidence-v2",
  )
  const row = fundingDecisionPersistenceRows([relationship()])[0]
  const description = row?.fundingProvenance[0]?.description ?? ""
  assert.match(description, /policy result were not recomputed/i)
})
