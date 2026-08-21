import { db } from "@/lib/db/prisma"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"

const decisionNeutralSuppressionReasons = [
  "trusted_funding_source",
  "neutral_infrastructure_funder",
  "trusted_funding_source_fanout",
  "neutral_infrastructure_fanout",
  "trusted_funding_source_lineage",
  "neutral_infrastructure_lineage",
]

export async function loadDecisionFundingRelationships(
  analysisId: string,
): Promise<FundingDecisionRelationshipInput[]> {
  try {
    return await db.campaignFundingRelationship.findMany({
      where: {
        analysisRunId: analysisId,
        OR: [
          { riskBearing: true },
          { suppressionReason: { in: decisionNeutralSuppressionReasons } },
        ],
      },
      select: {
        relationshipKey: true,
        kind: true,
        chain: true,
        sourceAddress: true,
        targetAddress: true,
        viaAddress: true,
        hopCount: true,
        cohortSize: true,
        confidence: true,
        riskBearing: true,
        suppressionReason: true,
        evidenceEventKeys: true,
        observedAt: true,
        metadata: true,
      },
      orderBy: [
        { riskBearing: "desc" },
        { cohortSize: "desc" },
        { confidence: "desc" },
        { relationshipKey: "asc" },
      ],
    })
  } catch (error) {
    // Decision provenance is supplemental. A missing preview migration or a
    // temporary relationship-store failure must not hide the underlying
    // campaign analysis or change its decision semantics.
    console.warn("Funding provenance evidence unavailable", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}
