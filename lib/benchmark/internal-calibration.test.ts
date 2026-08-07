import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import Papa from "papaparse"

import {
  runInternalCalibration,
} from "@/lib/benchmark/internal-calibration"
import {
  REVIEWER_EXPORT_HEADERS,
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
  groundTruthLabel: string,
  expectedDecision: string,
  acceptableDecisions: string,
  maliciousRiskExpectation: string,
  confidence: string
): BlindReviewerRow {
  return {
    labeling_schema_version: REAL_WORLD_LABELING_SCHEMA_VERSION,
    cohort: "representative",
    scenario_id: "sc-calibration",
    split_group_id: "sg-calibration",
    case_id: caseId,
    chain: "Solana",
    wallet_address: walletAddress,
    campaign_type: "Airdrop",
    explorer_url: `https://explorer.solana.com/address/${walletAddress}`,
    review_evidence_json: "{}",
    ground_truth_label: groundTruthLabel,
    expected_decision: expectedDecision,
    acceptable_decisions: acceptableDecisions,
    malicious_risk_expectation: maliciousRiskExpectation,
    reviewer: "reviewer-one",
    reviewed_at: "2026-08-07T18:30:00Z",
    review_confidence: confidence,
    rationale: "Independent blind-review rationale.",
    tags: "[]",
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

  rows.forEach((row, index) => {
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
      firstSeen: isSybil ? "2026-08-07T18:00:00.000Z" : "2025-01-01T00:00:00.000Z",
      lastSeen: "2026-08-07T18:00:00.000Z",
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
      behaviorFingerprint: isSybil ? [] : ["protocol-a", "protocol-b", "protocol-c"],
      campaignQualityScore: isSybil ? 0 : 100,
      campaignOnlyRatio: null,
      behaviorDiversityScore: isSybil ? 0 : 100,
      botScriptScore: isSybil ? 0 : 0,
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
    assert.equal(index >= 0, true)
  })

  return `${lines.join("\n")}\n`
}

test("internal calibration normalizes legacy reviewer values without making external claims", () => {
  const rows = [
    baseRow(
      "rw-organic",
      "11111111111111111111111111111112",
      "organic_user",
      "approve",
      '["approve"]',
      "low",
      "0.88"
    ),
    baseRow(
      "rw-sybil",
      "11111111111111111111111111111113",
      "sybil",
      "reject",
      '["reject","flag_for_review"]',
      "high",
      "0.90"
    ),
  ]

  const reviewerCsv = `${reviewerRowsToCsv(rows)}\n`
  const originalCsv = `${reviewerRowsToCsv(rows.map(blankReviewFields))}\n`
  const audit = auditCsv(rows)
  const seal = {
    sealSchemaVersion: "tri-proof-review-seal-v1",
    batchId: "unit-test-batch",
    generatedAt: "2026-08-07T18:00:00.000Z",
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

  const result = runInternalCalibration(
    reviewerCsv,
    Buffer.from(JSON.stringify(seal), "utf8")
  )

  assert.equal(result.claimEligible, false)
  assert.equal(result.integrity.reviewerSnapshotMatchesSeal, true)
  assert.equal(result.integrity.auditMatchesSeal, true)
  assert.equal(result.normalization.legacyExpectedDecisionRows, 2)
  assert.equal(result.normalization.legacyMaliciousExpectationRows, 2)
  assert.equal(result.normalization.numericConfidenceRows, 2)
  assert.equal(result.normalization.jsonListRows, 2)
  assert.equal(result.secondReviewRequiredCases, 1)
  assert.equal(result.report.metrics.claimReadiness.ready, false)

  const normalized = Papa.parse<Record<string, string>>(
    result.normalizedReviewerCsv,
    { header: true, skipEmptyLines: true }
  ).data
  assert.equal(normalized[0]?.expected_decision, "approved")
  assert.equal(normalized[0]?.malicious_risk_expectation, "absent")
  assert.equal(normalized[0]?.review_confidence, "high")
  assert.equal(normalized[1]?.expected_decision, "rejected")
  assert.equal(normalized[1]?.acceptable_decisions, "rejected|manual_review")
  assert.equal(normalized[1]?.malicious_risk_expectation, "present")

  const secondary = Papa.parse<Record<string, string>>(
    result.secondReviewerCsv,
    { header: true, skipEmptyLines: true }
  ).data
  assert.equal(secondary.length, 1)
  assert.equal(secondary[0]?.case_id, "rw-sybil")
  assert.equal(secondary[0]?.ground_truth_label, "")
  assert.equal(secondary[0]?.reviewer, "")
})
