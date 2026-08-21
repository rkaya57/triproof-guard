import { Prisma } from "@prisma/client"

import {
  normalizeClusterAnalystProposalType,
  type ClusterAnalystProposalPayload,
  type ClusterAnalystProposalRecord,
} from "@/lib/cluster-investigation/proposals"
import { db } from "@/lib/db/prisma"

export function isMissingClusterAnalystProposalTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021"
}

export function serializeClusterAnalystProposal(proposal: {
  id: string
  analysisId: string
  clusterLabel: string
  analystId: string
  analystName: string
  proposalType: string
  payload: unknown
  notes: string | null
  source: string
  createdAt: Date
}): ClusterAnalystProposalRecord {
  return {
    id: proposal.id,
    analysisId: proposal.analysisId,
    clusterLabel: proposal.clusterLabel,
    analystId: proposal.analystId,
    analystName: proposal.analystName,
    proposalType: normalizeClusterAnalystProposalType(proposal.proposalType) ?? "analyst_note",
    payload: proposal.payload && typeof proposal.payload === "object" && !Array.isArray(proposal.payload)
      ? (proposal.payload as ClusterAnalystProposalPayload)
      : {},
    notes: proposal.notes,
    source: proposal.source,
    createdAt: proposal.createdAt.toISOString(),
  }
}

export async function loadClusterAnalystProposalHistory(
  analysisId: string,
  clusterLabel: string,
  limit = 20,
): Promise<{ storageAvailable: boolean; proposals: ClusterAnalystProposalRecord[] }> {
  try {
    const rows = await db.clusterAnalystProposal.findMany({
      where: { analysisId, clusterLabel },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
    })
    return { storageAvailable: true, proposals: rows.map(serializeClusterAnalystProposal) }
  } catch (error) {
    if (isMissingClusterAnalystProposalTable(error)) return { storageAvailable: false, proposals: [] }
    throw error
  }
}
