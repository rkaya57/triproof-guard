export type CalibrationEvidenceCase = {
  groundTruth: "benign" | "malicious"
  surface: "url" | "token" | "transaction" | "wallet"
  evidenceScore: number
  independentFamilies: string[]
  independentSources: string[]
}

export type CalibrationEvidenceCoverage = {
  total: number
  withEvidence: number
  evidenceCoverage: number
  maliciousTotal: number
  maliciousWithEvidence: number
  maliciousEvidenceCoverage: number
  sourceDiverseMalicious: number
  sourceDiverseMaliciousCoverage: number
  bySurface: Record<string, { total: number; withEvidence: number; coverage: number }>
}

export function summarizeCalibrationEvidenceCoverage(cases: CalibrationEvidenceCase[]): CalibrationEvidenceCoverage {
  const bySurface: CalibrationEvidenceCoverage["bySurface"] = {}
  let withEvidence = 0
  let maliciousTotal = 0
  let maliciousWithEvidence = 0
  let sourceDiverseMalicious = 0

  for (const item of cases) {
    const hasEvidence = item.evidenceScore > 0 || item.independentFamilies.length > 0 || item.independentSources.length > 0
    if (hasEvidence) withEvidence += 1

    const surface = bySurface[item.surface] ?? { total: 0, withEvidence: 0, coverage: 0 }
    surface.total += 1
    if (hasEvidence) surface.withEvidence += 1
    bySurface[item.surface] = surface

    if (item.groundTruth === "malicious") {
      maliciousTotal += 1
      if (hasEvidence) maliciousWithEvidence += 1
      if (item.independentSources.length >= 2) sourceDiverseMalicious += 1
    }
  }

  for (const value of Object.values(bySurface)) {
    value.coverage = value.total ? value.withEvidence / value.total : 0
  }

  return {
    total: cases.length,
    withEvidence,
    evidenceCoverage: cases.length ? withEvidence / cases.length : 0,
    maliciousTotal,
    maliciousWithEvidence,
    maliciousEvidenceCoverage: maliciousTotal ? maliciousWithEvidence / maliciousTotal : 0,
    sourceDiverseMalicious,
    sourceDiverseMaliciousCoverage: maliciousTotal ? sourceDiverseMalicious / maliciousTotal : 0,
    bySurface,
  }
}
