import assert from "node:assert/strict"
import test from "node:test"
import { PDFDocument } from "pdf-lib"

import { walletsToCsv } from "@/lib/exports/csv"
import { buildPdfReport } from "@/lib/exports/pdf"
import { buildPdfReportWithAi } from "@/lib/exports/pdf-with-ai"
import type { AnalysisDetail, WalletRiskResult } from "@/types"

function canonicalWallet(): WalletRiskResult {
  return {
    walletAddress: "0x1111111111111111111111111111111111111111",
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 42,
    riskLevel: "medium",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Gray Zone under Balanced policy.",
    fundingSource: "0x7777777777777777777777777777777777777777",
    txCount: 12,
    walletAgeDays: 90,
    totalVolume: 30,
    contractsCount: 3,
    campaignActionsCount: 2,
    clusterId: null,
    reasons: ["Legacy deterministic engine evidence."],
    enrichmentStatus: "completed",
    decisionEvidence: {
      schemaVersion: "campaign-security-explanation-v1",
      decision: "manual_review",
      recommendedAction: "manual_review",
      evidenceConfidence: "high",
      evidenceFamilies: ["funding"],
      independentRiskFamilyCount: 0,
      evidence: [
        {
          code: "CANONICAL_BURST_FUNDING_COHORT",
          family: "funding",
          effect: "corroborating_signal",
          title: "Canonical burst-funding cohort",
          description:
            "Supplemental canonical provenance; stored decision, risk score, and policy result were not recomputed.",
          source: "graph",
        },
      ],
      limitations: [],
      requiresHumanReview: true,
      humanReview: null,
    },
  }
}

function analysis(): AnalysisDetail {
  return {
    id: "analysis-export-1",
    status: "completed",
    totalWallets: 1,
    approvedCount: 0,
    manualReviewCount: 1,
    rejectedCount: 0,
    averageRiskScore: 42,
    suspiciousClustersCount: 0,
    csvFileName: "campaign.csv",
    createdAt: "2026-08-21T10:00:00.000Z",
    completedAt: "2026-08-21T10:05:00.000Z",
    analysisMode: "onchain",
    riskPolicy: "balanced",
    enrichment: null,
    feedbackSummary: null,
    teamReviewSummary: null,
    project: {
      id: "project-1",
      name: "Export Safety Campaign",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: null,
    },
    wallets: [canonicalWallet()],
    clusters: [],
    graph: null,
    aiBrief: null,
  }
}

test("full CSV exports canonical funding evidence without changing the legacy risk-reasons column", () => {
  const wallet = canonicalWallet()
  const full = walletsToCsv([wallet], true)
  const compact = walletsToCsv([wallet], false)

  assert.match(full, /canonical_funding_evidence_codes/)
  assert.match(full, /CANONICAL_BURST_FUNDING_COHORT/)
  assert.match(full, /canonical_funding_evidence_supplemental_only/)
  assert.match(full, /Legacy deterministic engine evidence\./)
  assert.doesNotMatch(compact, /canonical_funding_evidence_codes/)
})

test("PDF export appends canonical funding provenance even when no AI brief exists", async () => {
  const input = analysis()
  const baseBytes = await buildPdfReport(input)
  const evidenceBytes = await buildPdfReportWithAi(input)
  const basePdf = await PDFDocument.load(baseBytes)
  const evidencePdf = await PDFDocument.load(evidenceBytes)

  assert.equal(evidencePdf.getPageCount(), basePdf.getPageCount() + 1)
  assert.ok(evidenceBytes.byteLength > baseBytes.byteLength)
})
