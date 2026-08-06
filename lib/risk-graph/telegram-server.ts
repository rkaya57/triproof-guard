import { db } from "@/lib/db/prisma"
import {
  extractTelegramOnchainEntities,
  telegramObservationMatchesCampaign,
} from "@/lib/telegram/intelligence"
import type { SharedRiskGraphTelegramObservation } from "@/lib/risk-graph/types"

export async function loadCampaignTelegramObservations(
  userId: string,
  campaignAddresses: string[]
): Promise<SharedRiskGraphTelegramObservation[]> {
  if (campaignAddresses.length === 0) return []

  const scans = await db.telegramScanEvent.findMany({
    where: { group: { ownerId: userId } },
    select: {
      id: true,
      groupId: true,
      telegramMessageId: true,
      target: true,
      domain: true,
      scanType: true,
      chain: true,
      riskLevel: true,
      score: true,
      confidence: true,
      summary: true,
      createdAt: true,
      group: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  return scans.flatMap((scan) => {
    const extractedEntities = extractTelegramOnchainEntities({
      target: scan.target,
      domain: scan.domain,
      scanType: scan.scanType,
      chain: scan.chain,
    })
    if (!telegramObservationMatchesCampaign(extractedEntities, campaignAddresses)) {
      return []
    }

    return [{
      id: scan.id,
      groupId: scan.groupId,
      groupTitle: scan.group?.title ?? null,
      messageId: scan.telegramMessageId,
      target: scan.target,
      domain: scan.domain,
      scanType: scan.scanType,
      chain: scan.chain,
      riskLevel: scan.riskLevel,
      score: scan.score,
      confidence: scan.confidence,
      summary: scan.summary,
      createdAt: scan.createdAt.toISOString(),
      extractedEntities,
    }]
  })
}

export function telegramIntelCandidates(
  observations: SharedRiskGraphTelegramObservation[]
) {
  const values = new Set<string>()
  observations.forEach((observation) => {
    observation.extractedEntities?.forEach((entity) => {
      if (["wallet", "token", "contract", "program", "domain"].includes(entity.kind)) {
        values.add(entity.value)
        if (entity.chain === "evm") values.add(entity.value.toLowerCase())
      }
    })
  })
  return Array.from(values)
}

export function telegramDomains(
  observations: SharedRiskGraphTelegramObservation[]
) {
  const domains = new Set<string>()
  observations.forEach((observation) => {
    if (observation.domain) domains.add(observation.domain.toLowerCase())
    observation.extractedEntities?.forEach((entity) => {
      if (entity.kind === "domain") domains.add(entity.value.toLowerCase())
    })
  })
  return Array.from(domains)
}
