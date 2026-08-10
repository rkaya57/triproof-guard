import type { ScamGuardV2HoldoutChain, ScamGuardV2HoldoutGroundTruth, ScamGuardV2HoldoutSurface } from "./holdout-dataset-contract"

export type ScamGuardV2SecondHoldoutRecord = {
  id: string
  projectId: string
  surface: ScamGuardV2HoldoutSurface
  chain: ScamGuardV2HoldoutChain
  groundTruth: ScamGuardV2HoldoutGroundTruth
  sourceUrl?: string
  provenanceId: string
  collectedAt: string
}

export const scamGuardV2SecondHoldoutContract = {
  schemaVersion: 1,
  role: "independent_final_validation" as const,
  minimumTotalCases: 180,
  minimumProjects: 8,
  minimumGroundTruthPerClass: 60,
  minimumSurfaceCases: {
    url: 40,
    token: 40,
    transaction: 50,
    wallet: 30,
  },
  minimumTransactionSourceContextCoverage: 0.8,
  requiresDistinctProvenance: true,
  excludesSeenFixtureIds: true,
  internalAdjudicationExcluded: true,
  internalGraphContextExcluded: true,
  productionDecisionChangesAllowed: false,
} as const

export function validateSecondHoldoutDataset(
  records: ScamGuardV2SecondHoldoutRecord[],
  seenIds: Iterable<string> = [],
) {
  const blockers: string[] = []
  const seen = new Set([...seenIds].map((value) => value.trim()).filter(Boolean))
  const ids = new Set<string>()
  const projects = new Set<string>()
  const provenance = new Set<string>()
  const chains = new Set<ScamGuardV2HoldoutChain>()
  const surfaceCounts: Record<ScamGuardV2HoldoutSurface, number> = { url: 0, token: 0, transaction: 0, wallet: 0 }
  const groundTruthCounts: Record<ScamGuardV2HoldoutGroundTruth, number> = { benign: 0, malicious: 0 }
  let transactionCases = 0
  let transactionCasesWithSourceContext = 0

  for (const record of records) {
    const id = record.id.trim()
    const projectId = record.projectId.trim()
    const provenanceId = record.provenanceId.trim()
    if (!id) blockers.push("Every second-Holdout record requires an id.")
    else if (ids.has(id)) blockers.push(`Duplicate second-Holdout id: ${id}`)
    else {
      ids.add(id)
      if (seen.has(id)) blockers.push(`Seen calibration id is prohibited from final validation: ${id}`)
    }
    if (!projectId) blockers.push(`Record ${id || "<missing-id>"} requires projectId.`)
    else projects.add(projectId)
    if (!provenanceId) blockers.push(`Record ${id || "<missing-id>"} requires independent provenanceId.`)
    else provenance.add(provenanceId)
    if (!Number.isFinite(Date.parse(record.collectedAt))) blockers.push(`Record ${id || "<missing-id>"} requires a valid collectedAt timestamp.`)

    surfaceCounts[record.surface] += 1
    groundTruthCounts[record.groundTruth] += 1
    if (record.chain !== "unknown") chains.add(record.chain)
    if (record.surface === "transaction") {
      transactionCases += 1
      if (record.sourceUrl?.trim()) transactionCasesWithSourceContext += 1
    }
  }

  if (records.length < scamGuardV2SecondHoldoutContract.minimumTotalCases) blockers.push(`Second Holdout requires at least ${scamGuardV2SecondHoldoutContract.minimumTotalCases} cases.`)
  if (projects.size < scamGuardV2SecondHoldoutContract.minimumProjects) blockers.push(`Second Holdout requires at least ${scamGuardV2SecondHoldoutContract.minimumProjects} projects/contexts.`)
  if (chains.size < 2) blockers.push("Second Holdout requires both Solana and EVM coverage.")
  for (const surface of Object.keys(scamGuardV2SecondHoldoutContract.minimumSurfaceCases) as ScamGuardV2HoldoutSurface[]) {
    const minimum = scamGuardV2SecondHoldoutContract.minimumSurfaceCases[surface]
    if (surfaceCounts[surface] < minimum) blockers.push(`${surface} requires at least ${minimum} cases.`)
  }
  for (const label of ["benign", "malicious"] as const) {
    if (groundTruthCounts[label] < scamGuardV2SecondHoldoutContract.minimumGroundTruthPerClass) blockers.push(`${label} requires at least ${scamGuardV2SecondHoldoutContract.minimumGroundTruthPerClass} cases.`)
  }
  const transactionSourceContextCoverage = transactionCases ? transactionCasesWithSourceContext / transactionCases : 0
  if (transactionSourceContextCoverage < scamGuardV2SecondHoldoutContract.minimumTransactionSourceContextCoverage) {
    blockers.push(`Transaction source-context coverage must be at least ${Math.round(scamGuardV2SecondHoldoutContract.minimumTransactionSourceContextCoverage * 100)}%.`)
  }

  return {
    valid: blockers.length === 0,
    totalCases: records.length,
    uniqueProjects: projects.size,
    uniqueProvenanceIds: provenance.size,
    surfaceCounts,
    groundTruthCounts,
    chains: [...chains].sort(),
    transactionCases,
    transactionCasesWithSourceContext,
    transactionSourceContextCoverage,
    blockers,
  }
}
