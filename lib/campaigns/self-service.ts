import type { Prisma } from "@prisma/client"

import {
  buildPersistedCampaignPolicyDefinition,
  persistedPolicyHash,
  riskPolicyFromNotes,
} from "@/lib/campaigns/persistence"
import { normalizeCampaignNetworks } from "@/lib/campaigns/model"
import {
  CAMPAIGN_INTAKE_SCHEMA_VERSION,
  campaignProjectNotes,
  type CampaignCreateInput,
  type CampaignRunContext,
} from "@/lib/campaigns/intake"
import { db } from "@/lib/db/prisma"
import { riskPolicies } from "@/lib/validators/wallet"
import type { RiskPolicy } from "@/types"

export async function createSelfServiceCampaign(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    campaign: CampaignCreateInput
  },
) {
  const notes = campaignProjectNotes(input.campaign)
  const project = await tx.project.create({
    data: {
      userId: input.userId,
      name: input.campaign.name,
      campaignType: input.campaign.campaignType,
      chain: input.campaign.chain,
      notes: notes || null,
    },
  })

  const campaign = await tx.campaign.create({
    data: {
      id: project.id,
      legacyProjectId: project.id,
      ownerUserId: input.userId,
      name: input.campaign.name,
      campaignType: input.campaign.campaignType,
      legacyChain: input.campaign.chain,
      networks: normalizeCampaignNetworks(input.campaign.chain),
      lifecycle: input.campaign.lifecycle,
      notes: notes || null,
      startsAt: input.campaign.startsAt,
      endsAt: input.campaign.endsAt,
      rewardPoolUsd: input.campaign.rewardPoolUsd,
      metadata: {
        schemaVersion: CAMPAIGN_INTAKE_SCHEMA_VERSION,
        source: "api-v2-self-service",
        clientMetadata: input.campaign.metadata,
      } as Prisma.InputJsonValue,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  })

  const policy = await tx.campaignPolicy.create({
    data: {
      campaignId: campaign.id,
      name: `${input.campaign.riskPolicy[0].toUpperCase()}${input.campaign.riskPolicy.slice(1)} campaign policy`,
      version: 1,
      preset: input.campaign.riskPolicy,
      policyHash: persistedPolicyHash(input.campaign.riskPolicy),
      definition: buildPersistedCampaignPolicyDefinition(input.campaign.riskPolicy),
      isActive: true,
    },
  })

  return { project, campaign, policy }
}

function normalizeStoredPolicy(value: string | null | undefined): RiskPolicy | null {
  return riskPolicies.includes(value as RiskPolicy) ? (value as RiskPolicy) : null
}

export async function loadCampaignRunContext(
  campaignId: string,
  userId: string,
): Promise<{
  project: {
    id: string
    userId: string
    name: string
    campaignType: string
    chain: string
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }
  campaign: {
    id: string
    lifecycle: "draft" | "active" | "paused" | "completed" | "archived"
  } | null
  activePolicy: {
    id: string
    preset: string | null
    version: number
  } | null
  runContext: CampaignRunContext
} | null> {
  const project = await db.project.findFirst({
    where: { id: campaignId, userId },
    select: {
      id: true,
      userId: true,
      name: true,
      campaignType: true,
      chain: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!project) return null

  const campaign = await db.campaign.findUnique({
    where: { legacyProjectId: project.id },
    select: {
      id: true,
      lifecycle: true,
      policies: {
        where: { isActive: true },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, preset: true, version: true },
      },
    },
  })
  const activePolicy = campaign?.policies[0] ?? null
  const riskPolicy = normalizeStoredPolicy(activePolicy?.preset) ?? riskPolicyFromNotes(project.notes)

  return {
    project,
    campaign: campaign ? { id: campaign.id, lifecycle: campaign.lifecycle } : null,
    activePolicy,
    runContext: {
      id: project.id,
      chain: project.chain,
      lifecycle: campaign?.lifecycle ?? "active",
      riskPolicy,
    },
  }
}
