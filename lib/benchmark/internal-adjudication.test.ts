import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import {
  runInternalAdjudication,
} from "@/lib/benchmark/internal-adjudication"
import {
  reviewerRowsToCsv,
  type BlindReviewerRow,
} from "@/lib/benchmark/reviewer-export"
import { REAL_WORLD_LABELING_SCHEMA_VERSION } from "@/lib/benchmark/labeling-queue"

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function baseRow(
  caseId: string,
  walletAddress: string,
  label: string,
  expectedDecision: string,
  acceptableDecisions: string,
  maliciousRiskExpectation: string,
  reviewer: string
): BlindReviewerRow {
  return {
    labeling_schema_version: REAL_WORLD_LABELING_SCHEMA_VERSION,
    cohort: "representative",
    scenario_id: "sc-adjudication",
    split_group_id: "sg-adjudication",
    case_id: caseId,
    chain: "Solana",
    wallet_address: walletAddress,
    campaign_type: "Airdrop",
    explorer_url: `https://explorer.solana.com/address/${walletAddress}`,
    review_evidence_json: "{}",
    ground_truth_label: label,
    expected_decision: expectedDecision,
    acceptable_decisions: acceptableDecisions,
    malicious_risk_expectation: maliciousRiskExpectation,
    reviewer,
    reviewed_at: "2026-08-08T18:30:00.000Z",
    review_confidence: "high",
    rationale: "Blind-review rationale.",
    tags: "review:test",
  }
}

function blankReviewFields(row: BlindReviewerRow): BlindReviewerRow {
  return {
    ...row,
    ground_truth_label: "",
    expected_decision: "",
    acceptable_decisions: "",
    malicious_risk_expectation: "",
    reviewer: "",
    reviewed_at: "",
    review_confidence: "",
    rationale: "",
    tags: "",
  }
}

function auditCsv(rows: BlindReviewerRow[]) {
  const headers = [
    "labeling_schema_version",
    "selected_cohort",
    "case_id",
    "scenario_id",
    "split_group_id",
    "chain",
    "wallet_address",
    "input_json",
  ]
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
  const lines = [headers.map(cell).join(",")]

  rows.forEach((row) => {
    const isSybil = row.ground_truth_label === "sybil"
    const input = {
      walletAddress: row.wallet_address,
      chain: row.chain,
      txCount: isSybil ? 1 : 500,
      walletAgeDays: isSybil ? 0 : 500,
      fundingSource: null,
      firstFundingAt: null,
      firstFundingAmount: null,
      historyTruncated: false,
      firstSeen: isSybil ? "2026-08-08T18:00:00.000Z" : "2025-01-01T00:00:00.000Z",
      lastSeen: "2026-08-08T18:00:00.000Z",
      totalVolume: isSybil ? 0 : 100,
      contractsCount: isSybil ? 1 : 20,
      campaignActionsCount: null,
      nativeBalance: isSybil ? 0 : 5,
      tokenCount: isSybil ? 0 : 10,
      uniqueCounterparties: isSybil ? 1 : 40,
      lastActiveDaysAgo: 0,
      isContract: false,
      knownEntityLabel: null,
      knownEntityType: "user",
      accountType: "system_user_wallet",
      ownerProgram: "11111111111111111111111111111111",
      behaviorFingerprint: isSybil ? [] : ["protocol-a", "protocol-b"],
      campaignQualityScore: isSybil ? 0 : 100,
      campaignOnlyRatio: null,
      behaviorDiversityScore: isSybil ? 0 : 100,
      botScriptScore: 0,
      policyAction: null,
      reputationLabel: null,
      policyReason: null,
      customerLabel: null,
      referrerAddress: null,
      referralCode: null,
      referralTimestamp: null,
      campaignEventAt: null,
      campaignEventType: null,
      campaignPoints: null,
      participantFingerprint: null,
      enrichmentProvider: "test",
      enrichmentStatus: "completed",
    }
    const values = [
      REAL_WORLD_LABELING_SCHEMA_VERSION,
      "representative",
      row.case_id,
      row.scenario_id,
      row.split_group_id,
      row.chain,
      row.wallet_address,
      JSON.stringify(input),
    ]
    lines.push(values.map(cell).join(","))
  })

  return `${lines.join("\n")}\n`
}

function fixture() {
  const firstRows = [
    baseRow(
      "rw-organic",
      "11111111111111111111111111111112",
      "organic_user",
      "approved",
      "approved",
      "absent",
      "reviewer-one"
    ),
    baseRow(
      "rw-sybil",
      "11111111111111111111111111111113",
      "sybil",
      "rejected",
      "rejected|manual_review",
      "present",
      "reviewer-one"
    ),
  ]
  const reviewerCsv = `${reviewerRowsToCsv(firstRows)}\n`
  const originalCsv = `${reviewerRowsToCsv(firstRows.map(blankReviewFields))}\n`
  const audit = auditCsv(firstRows)
  const seal = {
    sealSchemaVersion: "tri-proof-review-seal-v1",
    batchId: "adjudication-unit-test",
    generatedAt: "2026-08-08T18:00:00.000Z",
    labelingSchemaVersion: REAL_WORLD_LABELING_SCHEMA_VERSION,
    representativeSha256: sha256(originalCsv),
    auditSha256: sha256(audit),
    representativeCases: 2,
    contextRows: 2,
    projects: 1,
    byChain: { Solana: 2 },
    plannedSplits: { holdout: 2 },
    auditCsv: audit,
  }
  return { firstRows, reviewerCsv, sealBytes: Buffer.from(JSON.stringify(seal), "utf8") }
}

test("internal adjudication preserves first review and computes a separate claim-ineligible layer", () => {
  const { firstRows, reviewerCsv, sealBytes } = fixture()
  const second = {
    ...firstRows[1]!,
    ground_truth_label: "insufficient_data",
    expected_decision: "manual_review",
    acceptable_decisions: "manual_review|rejected",
    malicious_risk_expectation: "unknown",
    reviewer: "reviewer-two",
    reviewed_at: "2026-08-08T19:00:00.000Z",
    rationale: "Second reviewer found insufficient evidence for a malicious label.",
  }
  const result = runInternalAdjudication(
    reviewerCsv,
    sealBytes,
    `${reviewerRowsToCsv([second])}\n`
  )

  assert.equal(result.claimEligible, false)
  assert.equal(result.batchId, "adjudication-unit-test")
  assert.equal(result.provenance.firstReviewPreserved, true)
  assert.equal(result.provenance.secondReviewRows, 1)
  assert.equal(result.provenance.independentReviewerCases, 1)
  assert.equal(result.provenance.independenceSatisfied, true)
  assert.equal(result.original.labelCounts.sybil, 1)
  assert.equal(result.adjudicated.labelCounts.sybil ?? 0, 0)
  assert.equal(result.adjudicated.labelCounts.insufficient_data, 1)
  assert.equal(result.changes[0]?.firstLabel, "sybil")
  assert.equal(result.changes[0]?.adjudicatedLabel, "insufficient_data")
  assert.equal(result.changes[0]?.independentReviewer, true)
  assert.match(result.adjudicatedReviewerCsv, /first_review_label:sybil/)
})

test("internal adjudication reports reviewer overlap instead of treating it as independent", () => {
  const { firstRows, reviewerCsv, sealBytes } = fixture()
  const second = {
    ...firstRows[1]!,
    reviewer: "reviewer-one",
    reviewed_at: "2026-08-08T19:00:00.000Z",
  }
  const result = runInternalAdjudication(
    reviewerCsv,
    sealBytes,
    `${reviewerRowsToCsv([second])}\n`
  )
  assert.equal(result.provenance.independenceSatisfied, false)
  assert.equal(result.provenance.independentReviewerCases, 0)
  assert.equal(result.changes[0]?.independentReviewer, false)
})

test("internal adjudication rejects changes to immutable sealed case identity", () => {
  const { firstRows, reviewerCsv, sealBytes } = fixture()
  const second = {
    ...firstRows[1]!,
    wallet_address: "11111111111111111111111111119999",
    reviewer: "reviewer-two",
    reviewed_at: "2026-08-08T19:00:00.000Z",
  }
  assert.throws(
    () => runInternalAdjudication(reviewerCsv, sealBytes, `${reviewerRowsToCsv([second])}\n`),
    /immutable field wallet_address differs/
  )
})
