import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { db } from "@/lib/db/prisma"

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n")
}

function caseId(analysisId: string, walletId: string) {
  return `rw-${createHash("sha256")
    .update(`${analysisId}:${walletId}`)
    .digest("hex")
    .slice(0, 16)}`
}

function deterministicRoundRobin<T>(
  values: T[],
  key: (value: T) => string,
  limit: number
) {
  const buckets = new Map<string, T[]>()
  values.forEach((value) => {
    const bucketKey = key(value)
    const bucket = buckets.get(bucketKey) ?? []
    bucket.push(value)
    buckets.set(bucketKey, bucket)
  })

  const orderedKeys = Array.from(buckets.keys()).sort()
  const selected: T[] = []
  let index = 0
  while (selected.length < limit) {
    let added = false
    orderedKeys.forEach((bucketKey) => {
      const item = buckets.get(bucketKey)?.[index]
      if (item && selected.length < limit) {
        selected.push(item)
        added = true
      }
    })
    if (!added) break
    index += 1
  }
  return selected
}

async function main() {
  const limit = positiveInteger(process.env.BENCHMARK_LABEL_QUEUE_SIZE, 200)
  const candidatePool = Math.min(Math.max(limit * 10, 500), 5000)
  const outputDirectory = resolve(
    process.env.BENCHMARK_LABEL_QUEUE_OUTPUT ??
      "artifacts/benchmark-labeling"
  )

  const candidates = await db.walletAnalysis.findMany({
    where: {
      teamReviews: { none: {} },
      analysis: { status: "completed" },
    },
    select: {
      id: true,
      analysisId: true,
      walletAddress: true,
      chain: true,
      entityLabel: true,
      entityType: true,
      riskScore: true,
      riskLevel: true,
      status: true,
      recommendedAction: true,
      statusExplanation: true,
      fundingSource: true,
      txCount: true,
      walletAgeDays: true,
      totalVolume: true,
      contractsCount: true,
      campaignActionsCount: true,
      clusterId: true,
      graphComponentId: true,
      graphRiskScore: true,
      reasons: true,
      firstSeen: true,
      lastSeen: true,
      nativeBalance: true,
      tokenCount: true,
      uniqueCounterparties: true,
      lastActiveDaysAgo: true,
      isContract: true,
      enrichmentProvider: true,
      createdAt: true,
      analysis: {
        select: {
          projectId: true,
          project: {
            select: {
              campaignType: true,
              chain: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: candidatePool,
  })

  const selected = deterministicRoundRobin(
    candidates,
    (candidate) => `${candidate.chain}:${candidate.status}`,
    limit
  )

  const blindHeaders = [
    "scenario_id",
    "case_id",
    "chain",
    "wallet_address",
    "input_json",
    "ground_truth_label",
    "expected_decision",
    "acceptable_decisions",
    "malicious_risk_expectation",
    "provenance_kind",
    "source_ref",
    "reviewer",
    "reviewed_at",
    "rationale",
    "tags",
  ]
  const auditHeaders = [
    "case_id",
    "analysis_id",
    "project_id",
    "campaign_type",
    "engine_status",
    "recommended_action",
    "risk_score",
    "risk_level",
    "cluster_id",
    "graph_component_id",
    "graph_risk_score",
    "entity_type",
    "entity_label",
    "status_explanation",
    "reasons_json",
  ]

  const blindRows = selected.map((candidate) => {
    const id = caseId(candidate.analysisId, candidate.id)
    const input = {
      walletAddress: candidate.walletAddress,
      chain: candidate.chain,
      txCount: candidate.txCount,
      walletAgeDays: candidate.walletAgeDays,
      fundingSource: candidate.fundingSource,
      firstSeen: candidate.firstSeen?.toISOString() ?? null,
      lastSeen: candidate.lastSeen?.toISOString() ?? null,
      totalVolume: candidate.totalVolume,
      contractsCount: candidate.contractsCount,
      campaignActionsCount: candidate.campaignActionsCount,
      nativeBalance: candidate.nativeBalance,
      tokenCount: candidate.tokenCount,
      uniqueCounterparties: candidate.uniqueCounterparties,
      lastActiveDaysAgo: candidate.lastActiveDaysAgo,
      isContract: candidate.isContract,
      knownEntityLabel: candidate.entityLabel,
      knownEntityType: candidate.entityType,
      enrichmentProvider: candidate.enrichmentProvider,
      enrichmentStatus: candidate.enrichmentProvider ? "completed" : null,
    }

    return {
      scenario_id: `real-world-${candidate.analysisId}`,
      case_id: id,
      chain: candidate.chain,
      wallet_address: candidate.walletAddress,
      input_json: JSON.stringify(input),
      ground_truth_label: "",
      expected_decision: "",
      acceptable_decisions: "",
      malicious_risk_expectation: "",
      provenance_kind: "verified_human",
      source_ref: `analysis:${candidate.analysisId}/wallet:${candidate.id}`,
      reviewer: "",
      reviewed_at: "",
      rationale: "",
      tags: "",
    }
  })

  const auditRows = selected.map((candidate) => ({
    case_id: caseId(candidate.analysisId, candidate.id),
    analysis_id: candidate.analysisId,
    project_id: candidate.analysis.projectId,
    campaign_type: candidate.analysis.project.campaignType,
    engine_status: candidate.status,
    recommended_action: candidate.recommendedAction,
    risk_score: candidate.riskScore,
    risk_level: candidate.riskLevel,
    cluster_id: candidate.clusterId,
    graph_component_id: candidate.graphComponentId,
    graph_risk_score: candidate.graphRiskScore,
    entity_type: candidate.entityType,
    entity_label: candidate.entityLabel,
    status_explanation: candidate.statusExplanation,
    reasons_json: JSON.stringify(candidate.reasons),
  }))

  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "labeling-queue-blind.csv"),
      `${csv(blindHeaders, blindRows)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "labeling-audit-map.csv"),
      `${csv(auditHeaders, auditRows)}\n`,
      "utf8"
    ),
  ])

  console.log(
    JSON.stringify({
      selected: selected.length,
      candidatePool: candidates.length,
      outputDirectory,
      blindReview: true,
    })
  )
}

main()
  .catch((error) => {
    console.error("Failed to export benchmark labeling queue", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
