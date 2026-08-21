import { db } from "@/lib/db/prisma"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"

export const MAX_DECISION_FUNDING_RELATIONSHIP_PROJECTION = 50_000

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
      // Decision Evidence is a user-facing projection, not the canonical store.
      // The full relationship set remains available through the paginated
      // campaign relationships API. Risk-bearing and large-cohort evidence sort
      // first so the bounded projection degrades toward the highest-signal set.
      take: MAX_DECISION_FUNDING_RELATIONSHIP_PROJECTION,
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
