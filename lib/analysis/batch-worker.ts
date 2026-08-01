import { Prisma } from "@prisma/client"

import { normalizeChainAddress } from "@/lib/address-normalization"
import {
  createAnalysisBatchLeaseToken,
  recoverStaleAnalysisBatches,
  startAnalysisBatchHeartbeat,
} from "@/lib/analysis/batch-lease"
import { db } from "@/lib/db/prisma"
import {
  analyzeWallets,
  riskPolicyFromNotes,
  riskPolicyThresholdSnapshot,
  RISK_POLICY_VERSION,
  SYBIL_ENGINE_VERSION,
  SYBIL_RULESET_VERSION,
  type CrossCampaignContext,
} from "@/lib/risk-engine"
import {
  fundingContextKey,
  normalizeGraphAddress,
  type WalletGraphContext,
} from "@/lib/graph-intelligence"
import { enrichWallets } from "@/lib/onchain/enrich-wallet"
import { mergeEnrichment } from "@/lib/onchain/merge"
import { parseCampaignContracts } from "@/lib/validators/wallet"
import { deliverAnalysisCompletedWebhook } from "@/lib/webhooks/deliver"
import type { AnalysisMode, EnrichmentMeta, ParsedWallet } from "@/types"
import {
  SOLANA_ENRICHMENT_SCHEMA_VERSION,
  type EnrichmentSummary,
  type WalletEnrichmentResult,
} from "@/lib/onchain/enrichment-types"

const MAX_BATCH_RETRIES = Math.max(3, Number.parseInt(process.env.ANALYSIS_MAX_BATCH_RETRIES ?? "5", 10) || 5)

type BatchRow = {
  id: string
  analysisId: string
  batchIndex: number
  status: string
  walletData: unknown
  enrichmentResults: unknown | null
  enrichmentSummary: unknown | null
  retryCount: number
  errorMessage: string | null
}

type BatchReadinessRow = {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
}

type BatchWriteClient = Pick<Prisma.TransactionClient, "$executeRaw">

type FundingIntelEntry = {
  normalized: string
  chain: string
  verdict: "TRUSTED" | "KNOWN_BAD"
  label: string
}

function toDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function extractCampaignContracts(notes: string | null | undefined) {
  if (!notes) return []
  const line = notes
    .split(/\r?\n/)
    .find((value) => value.startsWith("TRIPROOF_CAMPAIGN_CONTRACTS="))
  if (!line) return []
  return parseCampaignContracts(line.replace("TRIPROOF_CAMPAIGN_CONTRACTS=", ""))
}

function hasDeepHistoryEnabled(notes: string | null | undefined) {
  return /^TRIPROOF_DEEP_HISTORY=true$/m.test(notes ?? "")
}

function intelChainMatches(entryChain: string, walletChain: string) {
  if (!entryChain) return true
  const normalizedEntryChain = entryChain.trim().toLowerCase()
  const normalizedWalletChain = walletChain.trim().toLowerCase()
  if (normalizedEntryChain === normalizedWalletChain) return true
  return normalizedEntryChain === "evm" && normalizedWalletChain !== "solana"
}

function normalizeIntelAddress(address: string, chain: string) {
  const normalizedChain = chain.trim().toLowerCase()
  if (normalizedChain === "solana") return normalizeChainAddress(address, "Solana")
  if (normalizedChain === "evm" || address.trim().startsWith("0x")) {
    return normalizeChainAddress(address, "Ethereum")
  }
  return address.trim()
}

function buildFundingIntelLookup(entries: FundingIntelEntry[]) {
  const exact = new Map<string, FundingIntelEntry[]>()
  const legacyFolded = new Map<string, FundingIntelEntry[]>()

  entries.forEach((entry) => {
    const exactKey = normalizeIntelAddress(entry.normalized, entry.chain)
    exact.set(exactKey, [...(exact.get(exactKey) ?? []), entry])
    const foldedKey = entry.normalized.trim().toLowerCase()
    legacyFolded.set(foldedKey, [...(legacyFolded.get(foldedKey) ?? []), entry])
  })

  return { exact, legacyFolded }
}

function selectFundingIntel(
  lookup: ReturnType<typeof buildFundingIntelLookup>,
  fundingSource: string,
  walletChain: string
) {
  const exactKey = normalizeChainAddress(fundingSource, walletChain)
  const exactCandidates = (lookup.exact.get(exactKey) ?? []).filter((entry) =>
    intelChainMatches(entry.chain, walletChain)
  )
  if (exactCandidates.length) return exactCandidates[0] ?? null

  if (walletChain.trim().toLowerCase() !== "solana") {
    return (
      (lookup.legacyFolded.get(fundingSource.trim().toLowerCase()) ?? []).find((entry) =>
        intelChainMatches(entry.chain, walletChain)
      ) ?? null
    )
  }

  const legacyCandidates = (lookup.legacyFolded.get(fundingSource.trim().toLowerCase()) ?? [])
    .filter((entry) => intelChainMatches(entry.chain, walletChain))
  const distinctStoredAddresses = new Set(
    legacyCandidates.map((entry) => entry.normalized.trim())
  )

  // Legacy Solana intel may have been stored in lower case. Accept it only when
  // the folded lookup is unambiguous; otherwise ignore it rather than trusting
  // or blocking the wrong case-sensitive base58 address.
  return distinctStoredAddresses.size === 1 ? legacyCandidates[0] ?? null : null
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  const safeSize = Math.max(1, size)
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize))
  }
  return chunks
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

function resultEntries(results: Map<string, WalletEnrichmentResult>) {
  return Array.from(results.entries()).map(([address, result]) => ({ address, result }))
}

function resultMap(entries: unknown) {
  const map = new Map<string, WalletEnrichmentResult>()
  const parsed = parseJson<Array<{ address: string; result: WalletEnrichmentResult }>>(entries, [])
  parsed.forEach((entry) => {
    if (entry?.address && entry?.result) map.set(entry.address, entry.result)
  })
  return map
}

function completedResultMap(entries: unknown) {
  const completed = new Map<string, WalletEnrichmentResult>()
  resultMap(entries).forEach((result, address) => {
    if (result.status === "completed") completed.set(address, result)
  })
  return completed
}

function batchSummary(
  current: EnrichmentSummary,
  results: Map<string, WalletEnrichmentResult>,
  previous: EnrichmentSummary | null,
  unresolvedCount = 0
): EnrichmentSummary {
  const warnings = new Set([...(previous?.warnings ?? []), ...(current.warnings ?? [])])
  const providers = new Set(
    [...results.values()]
      .filter((result) => result.status === "completed")
      .map((result) => result.provider)
      .filter(Boolean)
  )
  const completed = Array.from(results.values()).filter((result) => result.status === "completed").length

  return {
    ...current,
    provider: Array.from(providers).join(",") || current.provider,
    enrichedCount: completed,
    failedCount: unresolvedCount,
    cacheHits: (previous?.cacheHits ?? 0) + current.cacheHits,
    warnings: Array.from(warnings),
  }
}

function mergeSummary(mode: AnalysisMode, summaries: EnrichmentSummary[]): EnrichmentMeta | null {
  if (!summaries.length) return null
  const warnings = new Set<string>()
  const providers = new Set<string>()
  let enrichedCount = 0
  let failedCount = 0
  let skippedCount = 0
  let cacheHits = 0
  let usedMockFallback = false

  summaries.forEach((summary) => {
    enrichedCount += summary.enrichedCount ?? 0
    failedCount += summary.failedCount ?? 0
    skippedCount += summary.skippedCount ?? 0
    cacheHits += summary.cacheHits ?? 0
    usedMockFallback = usedMockFallback || Boolean(summary.usedMockFallback)
    if (summary.provider) providers.add(summary.provider)
    ;(summary.warnings ?? []).forEach((warning) => warnings.add(String(warning)))
  })

  return {
    mode,
    provider: Array.from(providers).join(",") || "unknown",
    enrichedCount,
    failedCount,
    skippedCount,
    cacheHits,
    usedMockFallback,
    warnings: Array.from(warnings),
  }
}

export async function createAnalysisBatches(
  analysisId: string,
  wallets: ParsedWallet[],
  batchSize: number,
  client: BatchWriteClient = db
) {
  const chunks = chunkArray(wallets, batchSize)

  for (let index = 0; index < chunks.length; index += 1) {
    await client.$executeRaw`
      INSERT INTO "AnalysisBatch" (
        "id", "analysisId", "batchIndex", "status", "walletData", "createdAt", "updatedAt"
      ) VALUES (
        ${crypto.randomUUID()}, ${analysisId}, ${index}, 'pending', ${JSON.stringify(chunks[index])}::jsonb, NOW(), NOW()
      )
    `
  }

  return chunks.length
}

async function claimNextBatch(analysisId?: string) {
  await recoverStaleAnalysisBatches(analysisId)
  const leaseToken = createAnalysisBatchLeaseToken()

  const rows = analysisId
    ? await db.$queryRaw<BatchRow[]>`
        WITH next_batch AS (
          SELECT b."id"
          FROM "AnalysisBatch" b
          JOIN "Analysis" a ON a."id" = b."analysisId"
          WHERE b."status" = 'pending'
            AND b."analysisId" = ${analysisId}
            AND a."status" IN ('pending', 'processing', 'enriching')
          ORDER BY b."batchIndex" ASC, b."createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "AnalysisBatch" b
        SET "status" = 'processing',
            "startedAt" = NOW(),
            "updatedAt" = NOW(),
            "completedAt" = NULL,
            "errorMessage" = ${leaseToken}
        FROM next_batch
        WHERE b."id" = next_batch."id"
          AND b."status" = 'pending'
        RETURNING b.*
      `
    : await db.$queryRaw<BatchRow[]>`
        WITH next_batch AS (
          SELECT b."id"
          FROM "AnalysisBatch" b
          JOIN "Analysis" a ON a."id" = b."analysisId"
          WHERE b."status" = 'pending'
            AND a."status" IN ('pending', 'processing', 'enriching')
          ORDER BY b."createdAt" ASC, b."batchIndex" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "AnalysisBatch" b
        SET "status" = 'processing',
            "startedAt" = NOW(),
            "updatedAt" = NOW(),
            "completedAt" = NULL,
            "errorMessage" = ${leaseToken}
        FROM next_batch
        WHERE b."id" = next_batch."id"
          AND b."status" = 'pending'
        RETURNING b.*
      `

  return rows[0] ?? null
}

export async function finalizeAnalysisIfReady(analysisId: string) {
  let completed = false

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext(${analysisId})) AS locked
    `
    if (!lockRows[0]?.locked) return

    const readinessRows = await tx.$queryRaw<BatchReadinessRow[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "status" = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE "status" = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS failed
      FROM "AnalysisBatch"
      WHERE "analysisId" = ${analysisId}
    `
    const readiness = readinessRows[0]
    if (!readiness || readiness.total === 0 || readiness.pending > 0 || readiness.processing > 0) return

    const analysis = await tx.analysis.findUnique({ where: { id: analysisId }, include: { project: true } })
    if (!analysis || analysis.status === "completed" || analysis.status === "failed") return

    if (readiness.failed > 0) {
      await tx.analysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          enrichmentStatus: "failed",
          failedEnrichmentCount: readiness.failed,
          enrichmentWarnings: [
            `${readiness.failed.toLocaleString()} analysis batch(es) failed after retries. The analysis was not finalized with partial wallet results.`,
          ],
          completedAt: new Date(),
        },
      })
      return
    }

    const batches = await tx.$queryRaw<BatchRow[]>`
      SELECT * FROM "AnalysisBatch"
      WHERE "analysisId" = ${analysisId}
      ORDER BY "batchIndex" ASC
    `
    const originalWallets: ParsedWallet[] = []
    const enrichmentResults = new Map<string, WalletEnrichmentResult>()
    const summaries: EnrichmentSummary[] = []

    batches.forEach((batch) => {
      originalWallets.push(...parseJson<ParsedWallet[]>(batch.walletData, []))
      resultMap(batch.enrichmentResults).forEach((result, address) => enrichmentResults.set(address, result))
      const summary = parseJson<EnrichmentSummary | null>(batch.enrichmentSummary, null)
      if (summary) summaries.push(summary)
    })

    const mode = (analysis.analysisMode ?? "onchain") as AnalysisMode
    const riskPolicy = riskPolicyFromNotes(analysis.project.notes)
    const thresholdSnapshot = riskPolicyThresholdSnapshot(riskPolicy)
    const enrichmentMeta = mergeSummary(mode, summaries)
    const walletsForAnalysis = enrichmentResults.size
      ? mergeEnrichment(originalWallets, enrichmentResults, mode)
      : originalWallets
    const fundingIntel = await tx.scamGuardIntelEntry.findMany({
      where: {
        active: true,
        kind: { in: ["WALLET", "EVM_ADDRESS", "SOLANA_ADDRESS"] },
        verdict: { in: ["TRUSTED", "KNOWN_BAD"] },
      },
      select: {
        normalized: true,
        chain: true,
        verdict: true,
        label: true,
      },
    }) as FundingIntelEntry[]
    const graphContext: WalletGraphContext = {
      trustedFundingSources: {},
      knownBadFundingSources: {},
    }
    const fundingIntelLookup = buildFundingIntelLookup(fundingIntel)
    walletsForAnalysis.forEach((wallet) => {
      if (!wallet.fundingSource) return
      const entry = selectFundingIntel(
        fundingIntelLookup,
        wallet.fundingSource,
        wallet.chain
      )
      if (!entry) return
      const key = fundingContextKey(wallet.fundingSource, wallet.chain)
      if (entry.verdict === "TRUSTED") {
        graphContext.trustedFundingSources![key] = entry.label
      } else {
        graphContext.knownBadFundingSources![key] = entry.label
      }
    })

    const historicalWallets = await tx.walletAnalysis.findMany({
      where: {
        walletAddress: { in: walletsForAnalysis.map((wallet) => wallet.walletAddress) },
        analysis: {
          id: { not: analysisId },
          project: { userId: analysis.project.userId },
        },
      },
      select: {
        analysisId: true,
        walletAddress: true,
        chain: true,
        teamReviews: {
          select: { finalStatus: true },
        },
        feedbackEvents: {
          select: { label: true },
        },
      },
    })
    const crossCampaignSignals = new Map<string, {
      analyses: Set<string>
      confirmedRiskCount: number
      reviewedRejectionCount: number
      trustedUserCount: number
    }>()
    historicalWallets.forEach((historical) => {
      const key = normalizeGraphAddress(historical.walletAddress, historical.chain)
      const current = crossCampaignSignals.get(key) ?? {
        analyses: new Set<string>(),
        confirmedRiskCount: 0,
        reviewedRejectionCount: 0,
        trustedUserCount: 0,
      }
      current.analyses.add(historical.analysisId)
      current.confirmedRiskCount += historical.feedbackEvents.filter(
        (event) => event.label === "confirmed_risk"
      ).length
      current.trustedUserCount += historical.feedbackEvents.filter(
        (event) => event.label === "trusted_user"
      ).length
      current.reviewedRejectionCount += historical.teamReviews.filter(
        (review) => review.finalStatus === "rejected"
      ).length
      current.trustedUserCount += historical.teamReviews.filter(
        (review) => review.finalStatus === "approved"
      ).length
      crossCampaignSignals.set(key, current)
    })
    const crossCampaignContext: CrossCampaignContext = {
      walletSignals: Object.fromEntries(
        Array.from(crossCampaignSignals.entries()).map(([key, value]) => [
          key,
          {
            priorAnalyses: value.analyses.size,
            confirmedRiskCount: value.confirmedRiskCount,
            reviewedRejectionCount: value.reviewedRejectionCount,
            trustedUserCount: value.trustedUserCount,
          },
        ])
      ),
    }
    const result = analyzeWallets(
      walletsForAnalysis,
      enrichmentMeta,
      riskPolicy,
      graphContext,
      crossCampaignContext
    )

    await tx.analysis.update({ where: { id: analysisId }, data: { status: "analyzing" } })
    await tx.walletAnalysis.deleteMany({ where: { analysisId } })
    await tx.walletEnrichment.deleteMany({ where: { analysisId } })
    await tx.cluster.deleteMany({ where: { analysisId } })
    await tx.walletGraphEdge.deleteMany({ where: { analysisId } })
    await tx.walletGraphNode.deleteMany({ where: { analysisId } })
    await tx.walletGraphSummary.deleteMany({ where: { analysisId } })

    await tx.walletAnalysis.createMany({
      data: result.wallets.map((wallet) => ({
        analysisId,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        entityLabel: wallet.entityLabel,
        entityType: wallet.entityType,
        entityRiskReason: wallet.entityRiskReason,
        riskScore: wallet.riskScore,
        riskLevel: wallet.riskLevel,
        status: wallet.status,
        recommendedAction: wallet.recommendedAction,
        statusExplanation: wallet.statusExplanation,
        fundingSource: wallet.fundingSource,
        txCount: wallet.txCount,
        walletAgeDays: wallet.walletAgeDays,
        totalVolume: wallet.totalVolume,
        contractsCount: wallet.contractsCount,
        campaignActionsCount: wallet.campaignActionsCount,
        clusterId: wallet.clusterId,
        graphComponentId: wallet.graphComponentId ?? null,
        graphRiskScore: wallet.graphRiskScore ?? null,
        reasons: wallet.reasons,
        firstSeen: toDate(wallet.firstSeen),
        lastSeen: toDate(wallet.lastSeen),
        nativeBalance: wallet.nativeBalance ?? null,
        tokenCount: wallet.tokenCount ?? null,
        uniqueCounterparties: wallet.uniqueCounterparties ?? null,
        lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
        isContract: wallet.isContract ?? null,
        enrichmentProvider: wallet.enrichmentProvider ?? null,
        enrichmentStatus: wallet.enrichmentStatus ?? null,
      })),
    })

    if (enrichmentMeta) {
      await tx.walletEnrichment.createMany({
        data: result.wallets.map((wallet) => ({
          analysisId,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          provider: wallet.enrichmentProvider ?? enrichmentMeta.provider,
          txCount: wallet.txCount,
          walletAgeDays: wallet.walletAgeDays,
          firstSeen: toDate(wallet.firstSeen),
          lastSeen: toDate(wallet.lastSeen),
          totalVolume: wallet.totalVolume,
          nativeBalance: wallet.nativeBalance ?? null,
          tokenCount: wallet.tokenCount ?? null,
          contractsCount: wallet.contractsCount,
          campaignActionsCount: wallet.campaignActionsCount,
          uniqueCounterparties: wallet.uniqueCounterparties ?? null,
          fundingSource: wallet.fundingSource,
          isContract: wallet.isContract ?? null,
          knownEntityLabel: wallet.entityLabel,
          knownEntityType: wallet.entityType,
          enrichmentStatus: wallet.enrichmentStatus ?? "completed",
          rawData: {
            enrichmentSchemaVersion:
              wallet.chain === "Solana" ? SOLANA_ENRICHMENT_SCHEMA_VERSION : null,
            engineVersion: SYBIL_ENGINE_VERSION,
            rulesetVersion: SYBIL_RULESET_VERSION,
            riskPolicyVersion: RISK_POLICY_VERSION,
            thresholdSnapshot,
            accountType: wallet.accountType ?? null,
            ownerProgram: wallet.ownerProgram ?? null,
            behaviorFingerprint: wallet.behaviorFingerprint ?? [],
            campaignQualityScore: wallet.campaignQualityScore ?? null,
            campaignOnlyRatio: wallet.campaignOnlyRatio ?? null,
            behaviorDiversityScore: wallet.behaviorDiversityScore ?? null,
            botScriptScore: wallet.botScriptScore ?? null,
            policyAction: wallet.policyAction ?? null,
            reputationLabel: wallet.reputationLabel ?? null,
            policyReason: wallet.policyReason ?? null,
            customerLabel: wallet.customerLabel ?? null,
            firstFundingAt: wallet.firstFundingAt ?? null,
            firstFundingAmount: wallet.firstFundingAmount ?? null,
            historyTruncated: wallet.historyTruncated ?? null,
            riskPolicy,
          },
        })),
      })
    }

    if (result.clusters.length) {
      await tx.cluster.createMany({
        data: result.clusters.map((cluster) => ({
          analysisId,
          clusterLabel: cluster.clusterLabel,
          walletCount: cluster.walletCount,
          averageRiskScore: cluster.averageRiskScore,
          sharedFundingSource: cluster.sharedFundingSource,
          behaviorSimilarityScore: cluster.behaviorSimilarityScore,
          suggestedAction: cluster.suggestedAction,
          reasons: cluster.reasons,
        })),
      })
    }

    await tx.walletGraphSummary.create({
      data: {
        analysisId,
        totalNodes: result.graph.totalNodes,
        totalEdges: result.graph.totalEdges,
        connectedWallets: result.graph.connectedWallets,
        externalFunders: result.graph.externalFunders,
        referralLinks: result.graph.referralLinks,
        highRiskComponents: result.graph.highRiskComponents,
        neutralServiceFunders: result.graph.neutralServiceFunders,
        largestComponent: result.graph.largestComponent,
        maxComponentRisk: result.graph.maxComponentRisk,
        components: result.graph.components,
        findings: result.graph.findings,
      },
    })

    if (result.graph.nodes.length) {
      await tx.walletGraphNode.createMany({
        data: result.graph.nodes.map((node) => ({
          analysisId,
          nodeKey: node.nodeKey,
          address: node.address,
          chain: node.chain,
          kind: node.kind,
          label: node.label,
          walletAddress: node.walletAddress,
          componentId: node.componentId,
          metadata: node.metadata as Prisma.InputJsonValue,
        })),
      })
    }

    if (result.graph.edges.length) {
      await tx.walletGraphEdge.createMany({
        data: result.graph.edges.map((edge) => ({
          analysisId,
          edgeKey: edge.edgeKey,
          sourceKey: edge.sourceKey,
          targetKey: edge.targetKey,
          kind: edge.kind,
          confidence: edge.confidence,
          isRiskBearing: edge.isRiskBearing,
          componentId: edge.componentId,
          observedAt: toDate(edge.observedAt),
          transactionId: edge.transactionId,
          amount: edge.amount,
          evidence: edge.evidence,
          metadata: edge.metadata as Prisma.InputJsonValue,
        })),
      })
    }

    const versionWarnings = [
      `Sybil engine version: ${SYBIL_ENGINE_VERSION}`,
      `Sybil ruleset version: ${SYBIL_RULESET_VERSION}`,
      `Risk policy version: ${RISK_POLICY_VERSION}`,
      `Risk threshold snapshot: ${JSON.stringify(thresholdSnapshot)}`,
    ]

    await tx.analysis.update({
      where: { id: analysisId },
      data: {
        status: "completed",
        totalWallets: result.totalWallets,
        approvedCount: result.approvedCount,
        manualReviewCount: result.manualReviewCount,
        rejectedCount: result.rejectedCount,
        averageRiskScore: result.averageRiskScore,
        suspiciousClustersCount: result.clusters.length,
        enrichmentStatus: enrichmentMeta ? "completed" : null,
        enrichmentProvider: enrichmentMeta?.provider ?? null,
        enrichedWalletCount: enrichmentMeta?.enrichedCount ?? 0,
        failedEnrichmentCount: enrichmentMeta?.failedCount ?? 0,
        cacheHitCount: enrichmentMeta?.cacheHits ?? 0,
        usedMockFallback: enrichmentMeta?.usedMockFallback ?? false,
        enrichmentWarnings: [
          ...(enrichmentMeta?.warnings ?? []),
          ...versionWarnings,
        ],
        enrichedAt: enrichmentMeta ? new Date() : null,
        completedAt: new Date(),
      },
    })

    completed = true
  })

  if (completed) {
    deliverAnalysisCompletedWebhook(analysisId).catch((error) => {
      console.error("Webhook delivery failed", error)
    })
  }

  return completed
}

export async function finalizeReadyAnalyses(limit = 25) {
  await recoverStaleAnalysisBatches()
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT a."id"
    FROM "Analysis" a
    WHERE a."status" IN ('pending', 'processing', 'enriching', 'analyzing')
      AND EXISTS (
        SELECT 1 FROM "AnalysisBatch" b WHERE b."analysisId" = a."id"
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "AnalysisBatch" b
        WHERE b."analysisId" = a."id"
          AND b."status" IN ('pending', 'processing')
      )
    ORDER BY a."createdAt" ASC
    LIMIT ${Math.min(100, Math.max(1, limit))}
  `

  let finalized = 0
  for (const row of rows) {
    if (await finalizeAnalysisIfReady(row.id)) finalized += 1
  }

  return { checked: rows.length, finalized }
}

async function processBatch(batch: BatchRow) {
  const analysis = await db.analysis.findUnique({ where: { id: batch.analysisId }, include: { project: true } })
  if (!analysis) return { processed: true, status: "failed", message: "Analysis not found." }

  const leaseToken = batch.errorMessage
  if (!leaseToken?.startsWith("Worker lease: ")) {
    return {
      processed: false,
      status: "lease_missing",
      analysisId: batch.analysisId,
      batchId: batch.id,
      message: "Analysis batch lease token is missing.",
    }
  }

  const stopHeartbeat = startAnalysisBatchHeartbeat(batch.id, leaseToken)
  const wallets = parseJson<ParsedWallet[]>(batch.walletData, [])
  const mode = (analysis.analysisMode ?? "onchain") as AnalysisMode
  const campaignContracts = extractCampaignContracts(analysis.project.notes)
  const deepHistory = hasDeepHistoryEnabled(analysis.project.notes)
  const previousSummary = parseJson<EnrichmentSummary | null>(batch.enrichmentSummary, null)
  const previousResults = completedResultMap(batch.enrichmentResults)
  const walletsToEnrich = wallets.filter((wallet) => !previousResults.has(wallet.walletAddress))

  try {
    await db.analysis.update({ where: { id: analysis.id }, data: { status: "enriching", enrichmentStatus: "processing" } })
    const { results, summary } = await enrichWallets({
      addresses: walletsToEnrich.map((wallet) => wallet.walletAddress),
      chain: analysis.project.chain,
      mode,
      options: { campaignContracts, deepHistory },
    })

    results.forEach((result, address) => {
      if (result.status === "completed") previousResults.set(address, result)
    })
    const unresolvedAddresses = wallets
      .map((wallet) => wallet.walletAddress)
      .filter((address) => !previousResults.has(address))
    const combinedSummary = batchSummary(summary, previousResults, previousSummary, unresolvedAddresses.length)

    if (unresolvedAddresses.length > 0) {
      const nextRetryCount = (batch.retryCount ?? 0) + 1
      const retrying = nextRetryCount < MAX_BATCH_RETRIES
      const message = `${unresolvedAddresses.length.toLocaleString()} wallet enrichment(s) remain unavailable after provider failover. Successful wallets were retained; only unresolved wallets will be retried.`

      const updated = await db.$executeRaw`
        UPDATE "AnalysisBatch"
        SET "status" = ${retrying ? "pending" : "failed"},
            "retryCount" = ${nextRetryCount},
            "processedCount" = ${previousResults.size},
            "failedCount" = ${unresolvedAddresses.length},
            "enrichmentResults" = ${JSON.stringify(resultEntries(previousResults))}::jsonb,
            "enrichmentSummary" = ${JSON.stringify(combinedSummary)}::jsonb,
            "errorMessage" = ${message},
            "updatedAt" = NOW(),
            "completedAt" = CASE WHEN ${retrying} THEN NULL ELSE NOW() END
        WHERE "id" = ${batch.id}
          AND "status" = 'processing'
          AND "errorMessage" = ${leaseToken}
      `

      if (updated === 0) {
        return {
          processed: false,
          status: "lease_lost",
          analysisId: batch.analysisId,
          batchId: batch.id,
          message: "Analysis batch lease changed before retry results were committed.",
        }
      }
      if (!retrying) await finalizeAnalysisIfReady(batch.analysisId)
      return {
        processed: true,
        status: retrying ? "retrying" : "failed",
        analysisId: batch.analysisId,
        batchId: batch.id,
        message,
      }
    }

    const updated = await db.$executeRaw`
      UPDATE "AnalysisBatch"
      SET "status" = 'completed',
          "processedCount" = ${previousResults.size},
          "failedCount" = 0,
          "enrichmentResults" = ${JSON.stringify(resultEntries(previousResults))}::jsonb,
          "enrichmentSummary" = ${JSON.stringify(combinedSummary)}::jsonb,
          "completedAt" = NOW(),
          "updatedAt" = NOW(),
          "errorMessage" = NULL
      WHERE "id" = ${batch.id}
        AND "status" = 'processing'
        AND "errorMessage" = ${leaseToken}
    `

    if (updated === 0) {
      return {
        processed: false,
        status: "lease_lost",
        analysisId: batch.analysisId,
        batchId: batch.id,
        message: "Analysis batch lease changed before completion was committed.",
      }
    }

    const completed = await finalizeAnalysisIfReady(batch.analysisId)
    return { processed: true, status: completed ? "completed" : "processed", analysisId: batch.analysisId, batchId: batch.id, message: completed ? "Analysis completed." : "Batch processed." }
  } catch (error) {
    const nextRetryCount = (batch.retryCount ?? 0) + 1
    const retrying = nextRetryCount < MAX_BATCH_RETRIES
    const message = error instanceof Error ? error.message : "Unknown batch error"

    const updated = await db.$executeRaw`
      UPDATE "AnalysisBatch"
      SET "status" = ${retrying ? "pending" : "failed"},
          "retryCount" = ${nextRetryCount},
          "errorMessage" = ${message},
          "updatedAt" = NOW(),
          "completedAt" = CASE WHEN ${retrying} THEN NULL ELSE NOW() END
      WHERE "id" = ${batch.id}
        AND "status" = 'processing'
        AND "errorMessage" = ${leaseToken}
    `

    if (updated === 0) {
      return {
        processed: false,
        status: "lease_lost",
        analysisId: batch.analysisId,
        batchId: batch.id,
        message: "Analysis batch lease changed before the failure state was committed.",
      }
    }
    if (!retrying) await finalizeAnalysisIfReady(batch.analysisId)
    return { processed: true, status: retrying ? "retrying" : "failed", analysisId: batch.analysisId, batchId: batch.id, message }
  } finally {
    stopHeartbeat()
  }
}

export async function processNextAnalysisBatch() {
  const batch = await claimNextBatch()
  if (!batch) return { processed: false, status: "idle", message: "No pending analysis batch." }
  return processBatch(batch)
}

export async function processAnalysisBatchForAnalysis(analysisId: string) {
  const batch = await claimNextBatch(analysisId)
  if (!batch) {
    const completed = await finalizeAnalysisIfReady(analysisId)
    return { processed: false, status: completed ? "completed" : "idle", analysisId, message: completed ? "Analysis completed." : "No pending batch for this analysis." }
  }
  return processBatch(batch)
}
