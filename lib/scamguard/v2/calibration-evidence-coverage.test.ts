import assert from "node:assert/strict"
import test from "node:test"

import { summarizeCalibrationEvidenceCoverage } from "./calibration-evidence-coverage"

test("summarizes additive V2 evidence coverage without changing runtime decisions", () => {
  const summary = summarizeCalibrationEvidenceCoverage([
    { groundTruth: "malicious", surface: "url", evidenceScore: 30, independentFamilies: ["brand_impersonation"], independentSources: ["local-brand-registry"] },
    { groundTruth: "malicious", surface: "transaction", evidenceScore: 70, independentFamilies: ["transaction_impact", "threat_intelligence"], independentSources: ["v1-transaction-decoder", "phishing.database"] },
    { groundTruth: "benign", surface: "token", evidenceScore: 0, independentFamilies: [], independentSources: [] },
    { groundTruth: "malicious", surface: "wallet", evidenceScore: 0, independentFamilies: [], independentSources: [] },
  ])

  assert.equal(summary.total, 4)
  assert.equal(summary.withEvidence, 2)
  assert.equal(summary.evidenceCoverage, 0.5)
  assert.equal(summary.maliciousTotal, 3)
  assert.equal(summary.maliciousWithEvidence, 2)
  assert.equal(summary.maliciousEvidenceCoverage, 2 / 3)
  assert.equal(summary.sourceDiverseMalicious, 1)
  assert.equal(summary.sourceDiverseMaliciousCoverage, 1 / 3)
  assert.equal(summary.bySurface.transaction.coverage, 1)
  assert.equal(summary.bySurface.wallet.coverage, 0)
})
