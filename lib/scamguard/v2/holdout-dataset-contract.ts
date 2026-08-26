export type ScamGuardV2HoldoutSurface = "url" | "token" | "transaction" | "wallet"
export type ScamGuardV2HoldoutChain = "solana" | "evm" | "unknown"
export type ScamGuardV2HoldoutGroundTruth = "benign" | "malicious"

export type ScamGuardV2HoldoutRecord = {
  id: string
  projectId: string
  surface: ScamGuardV2HoldoutSurface
  chain: ScamGuardV2HoldoutChain
  groundTruth: ScamGuardV2HoldoutGroundTruth
}

export const scamGuardV2HoldoutDatasetContract = {
  schemaVersion: 1,
  frozenCommit: "8561f45c72868ae75e8a5bcfeb554b964717d8ff",
  freezeBranch: "freeze/scamguard-v2-holdout-2026-08-10",
  minimumTotalCases: 150,
  minimumProjects: 6,
  minimumChains: 2,
  minimumGroundTruthPerClass: 50,
  minimumSurfaceCases: {
    url: 30,
    token: 30,
    transaction: 40,
    wallet: 20,
  },
  evaluationMode: "holdout" as const,
  internalAdjudicationExcluded: true,
  internalGraphContextExcluded: true,
  productionDecisionChangesAllowed: false,
} as const

export type ScamGuardV2HoldoutDatasetValidation = {
  valid: boolean
  totalCases: number
  uniqueProjects: number
  onchainChains: ScamGuardV2HoldoutChain[]
  surfaceCounts: Record<ScamGuardV2HoldoutSurface, number>
  groundTruthCounts: Record<ScamGuardV2HoldoutGroundTruth, number>
  blockers: string[]
}

export function validateScamGuardV2HoldoutDataset(
  records: ScamGuardV2HoldoutRecord[],
): ScamGuardV2HoldoutDatasetValidation {
  const blockers: string[] = []
  const ids = new Set<string>()
  const projects = new Set<string>()
  const chains = new Set<ScamGuardV2HoldoutChain>()
  const surfaceCounts: Record<ScamGuardV2HoldoutSurface, number> = {
    url: 0,
    token: 0,
    transaction: 0,
    wallet: 0,
  }
  const groundTruthCounts: Record<ScamGuardV2HoldoutGroundTruth, number> = {
    benign: 0,
    malicious: 0,
  }

  for (const record of records) {
    const id = record.id.trim()
    const projectId = record.projectId.trim()
    if (!id) blockers.push("Every Holdout record requires a non-empty id.")
    else if (ids.has(id)) blockers.push(`Duplicate Holdout record id: ${id}`)
    else ids.add(id)

    if (!projectId) blockers.push(`Holdout record ${id || "<missing-id>"} requires a projectId.`)
    else projects.add(projectId)

    surfaceCounts[record.surface] += 1
    groundTruthCounts[record.groundTruth] += 1
    if ((record.surface === "token" || record.surface === "transaction" || record.surface === "wallet") && record.chain !== "unknown") {
      chains.add(record.chain)
    }
  }

  if (records.length < scamGuardV2HoldoutDatasetContract.minimumTotalCases) {
    blockers.push(`Holdout requires at least ${scamGuardV2HoldoutDatasetContract.minimumTotalCases} total cases.`)
  }
  if (projects.size < scamGuardV2HoldoutDatasetContract.minimumProjects) {
    blockers.push(`Holdout requires at least ${scamGuardV2HoldoutDatasetContract.minimumProjects} distinct projects/contexts.`)
  }
  if (chains.size < scamGuardV2HoldoutDatasetContract.minimumChains) {
    blockers.push(`Holdout requires at least ${scamGuardV2HoldoutDatasetContract.minimumChains} on-chain ecosystems.`)
  }

  for (const surface of Object.keys(scamGuardV2HoldoutDatasetContract.minimumSurfaceCases) as ScamGuardV2HoldoutSurface[]) {
    const minimum = scamGuardV2HoldoutDatasetContract.minimumSurfaceCases[surface]
    if (surfaceCounts[surface] < minimum) blockers.push(`${surface} surface requires at least ${minimum} cases.`)
  }

  for (const label of ["benign", "malicious"] as const) {
    if (groundTruthCounts[label] < scamGuardV2HoldoutDatasetContract.minimumGroundTruthPerClass) {
      blockers.push(`${label} ground truth requires at least ${scamGuardV2HoldoutDatasetContract.minimumGroundTruthPerClass} cases.`)
    }
  }

  return {
    valid: blockers.length === 0,
    totalCases: records.length,
    uniqueProjects: projects.size,
    onchainChains: [...chains].sort(),
    surfaceCounts,
    groundTruthCounts,
    blockers,
  }
}
