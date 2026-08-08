import fs from "node:fs"

const path = "components/analysis/analysis-detail.tsx"
const source = fs.readFileSync(path, "utf8")

const required = [
  "Campaign decision package is ready.",
  "Distribution readiness",
  "Human review",
  "Policy exclusions",
  "Analysis Intelligence Snapshot",
  "Known entities",
  "exchange/service entities",
  "Risk-policy spectrum",
  "APPROVE",
  "REVIEW",
  "EXCLUDE",
  "Decision Proof",
  "Evidence traceability",
  "Export Manual Review CSV",
  "manual-review workflows",
]

const forbidden = [
  "Clean-list decision package is ready.",
  "Risk contained",
  "Clean List Proof",
  "Export Gray Zone CSV",
  "Manual Review review",
  'title="Total wallets"',
  'title="Gray Zone"',
]

for (const marker of required) {
  if (!source.includes(marker)) {
    throw new Error(`Decision workspace UI marker missing: ${marker}`)
  }
}

for (const marker of forbidden) {
  if (source.includes(marker)) {
    throw new Error(`Legacy decision workspace UI marker still present: ${marker}`)
  }
}

const loadingStart = source.indexOf("  if (loading) {")
const loadingEnd = source.indexOf("  if (error || !analysis) {", loadingStart)
if (loadingStart < 0 || loadingEnd < 0) {
  throw new Error("Analysis loading-state boundaries could not be verified")
}
const loadingBlock = source.slice(loadingStart, loadingEnd)
if (!loadingBlock.includes('grid gap-5 sm:grid-cols-2 lg:grid-cols-4') || !loadingBlock.includes("animate-pulse")) {
  throw new Error("Analysis loading skeleton was unexpectedly altered")
}
if (loadingBlock.includes("AnalysisSnapshotPanel") || loadingBlock.includes("Decision Proof")) {
  throw new Error("Completed-report UI leaked into the loading skeleton")
}

const completedAnchor = source.indexOf("  const exportPath = exportBasePath ??")
const completedReturn = source.indexOf("  return (", completedAnchor)
const snapshotPosition = source.indexOf("<AnalysisSnapshotPanel", completedReturn)
const policyPosition = source.indexOf("Risk-policy spectrum", completedReturn)
const proofPosition = source.indexOf("Decision Proof", completedReturn)
const reasonCodesPosition = source.indexOf("Explainable Reason Codes", completedReturn)
if ([completedAnchor, completedReturn, snapshotPosition, policyPosition, proofPosition, reasonCodesPosition].some((value) => value < 0)) {
  throw new Error("Completed-report decision workspace structure could not be verified")
}
if (!(snapshotPosition < policyPosition && policyPosition < proofPosition && proofPosition < reasonCodesPosition)) {
  throw new Error("Decision workspace sections are not in the expected report order")
}

console.log("Decision workspace presentation contract verified")
