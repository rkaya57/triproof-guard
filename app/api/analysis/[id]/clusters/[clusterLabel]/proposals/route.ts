import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import {
  isMissingClusterAnalystProposalTable,
  serializeClusterAnalystProposal,
} from "@/lib/cluster-investigation/proposal-server"
import { buildClusterAnalystProposalEvidenceSnapshot } from "@/lib/cluster-investigation/proposal-snapshot"
import { normalizeClusterAnalystProposal } from "@/lib/cluster-investigation/proposals"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

const MAX_PROPOSAL_HISTORY = 20

function noStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

async function ownedReport(analysisId: string, userId: string, clusterLabel: string) {
  const result = await loadClusterInvestigation(analysisId, userId, clusterLabel)
  return result?.report ?? null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return noStore({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const report = await ownedReport(id, user.id, normalizedClusterLabel)
  if (!report) return noStore({ error: "Cluster not found" }, { status: 404 })

  try {
    const rows = await db.clusterAnalystProposal.findMany({
      where: { analysisId: id, clusterLabel: normalizedClusterLabel },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_PROPOSAL_HISTORY,
    })
    return noStore({
      storageAvailable: true,
      history: rows.map(serializeClusterAnalystProposal),
      applyWorkflowAvailable: false,
    })
  } catch (error) {
    if (isMissingClusterAnalystProposalTable(error)) {
      return noStore({ storageAvailable: false, history: [], applyWorkflowAvailable: false })
    }
    if (isDatabaseConnectionError(error)) {
      return noStore({ error: "Database is required for analyst proposal history" }, { status: 503 })
    }
    throw error
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return noStore({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const report = await ownedReport(id, user.id, normalizedClusterLabel)
  if (!report) return noStore({ error: "Cluster not found" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as {
    proposalType?: unknown
    payload?: unknown
    notes?: unknown
    source?: unknown
  } | null
  const normalized = normalizeClusterAnalystProposal(report, body ?? {})
  if (!normalized.proposal) {
    return noStore({ error: normalized.error ?? "Invalid analyst proposal" }, { status: 400 })
  }

  let mergeTargetReport = null
  if (normalized.proposal.proposalType === "merge_clusters") {
    const payload = normalized.proposal.payload as { targetClusterLabel: string }
    mergeTargetReport = await ownedReport(id, user.id, payload.targetClusterLabel)
    if (!mergeTargetReport) {
      return noStore({ error: "merge_clusters target must be another stored cluster in the same analysis" }, { status: 400 })
    }
  }

  const source = typeof body?.source === "string"
    ? body.source.trim().slice(0, 40) || "cluster_workspace"
    : "cluster_workspace"
  const evidenceSnapshot = buildClusterAnalystProposalEvidenceSnapshot({
    report,
    proposal: normalized.proposal,
    mergeTargetReport,
  })

  try {
    const proposal = await db.clusterAnalystProposal.create({
      data: {
        analysisId: id,
        clusterLabel: normalizedClusterLabel,
        analystId: user.id,
        analystName: user.name,
        proposalType: normalized.proposal.proposalType,
        payload: normalized.proposal.payload as unknown as Prisma.InputJsonValue,
        evidenceSnapshot: evidenceSnapshot as unknown as Prisma.InputJsonValue,
        notes: normalized.proposal.notes,
        source,
      },
    })

    return noStore({
      ok: true,
      proposal: serializeClusterAnalystProposal(proposal),
      mutatedClusterMembership: false,
      mutatedWalletDecisionState: false,
      mutatedCampaignPolicy: false,
      applyWorkflowAvailable: false,
    })
  } catch (error) {
    if (isMissingClusterAnalystProposalTable(error)) {
      return noStore({ error: "Analyst proposal storage is not deployed yet" }, { status: 503 })
    }
    if (isDatabaseConnectionError(error)) {
      return noStore({ error: "Database is required for analyst proposals" }, { status: 503 })
    }
    throw error
  }
}
