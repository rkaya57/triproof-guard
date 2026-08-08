import type { AiAnalysisBrief } from "@/types"

export type AiReportEvidenceMeta = {
  walletAssessments: number
  walletGeminiResponses: number
  walletFallbacks: number
  clusterAssessments: number
  clusterGeminiResponses: number
  clusterFallbacks: number
  gateEvents: number
  gateEscalations: number
  riskMutationViolations: number
  averageConfidence: number | null
  averageEvidenceSufficiency: number | null
  models: string[]
  topReasonCodes: Array<{ code: string; count: number }>
}

export type AiReportBrief = AiAnalysisBrief & {
  evidenceMeta?: AiReportEvidenceMeta
}
