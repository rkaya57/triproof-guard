import type { Prisma } from "@prisma/client"

import { normalizeCampaignNetworks, type CampaignLifecycle } from "@/lib/campaigns/model"
import {
  CAMPAIGN_OPERATIONS_SCHEMA_VERSION,
  normalizeCampaignLifecycleChange,
  normalizeCampaignPolicyChange,
  replaceRiskPolicyMarker,
} from "@/lib/campaigns/operations"
import {
  buildPersistedCampaignPolicyDefinition,
  persistedPolicyHash,
  riskPolicyFromNotes,
} from "@/lib/campaigns/persistence"
import { riskPolicies } from "@/lib/validators/wallet"
import type { RiskPolicy } from "@/types"

type Actor = {
  id: string
  name: string
}

export class CampaignOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = "CampaignOperationError"
  }
}

function storedRiskPolicy(value: string | null | undefined): RiskPolicy | null {
  return riskPolicies.includes(value as RiskPolicy) ? (value as RiskPolicy) : null
}

function operationStatus(code: string) {
  if (
    code === "POLICY_NO_CHANGE" ||
    code === "LIFECYCLE_NO_CHANGE" ||
    code === "INVALID_LIFECYCLE_TRANSITION" ||
    code === "CAMPAIGN_CLOSED"
  ) return 409
  return 400
}

function metadataObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, Prisma.JsonValue>
}

async function ownedProject(tx: Prisma.TransactionClient, campaignId: string, userId: string) {
  return tx.project.findFirst({
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
}

async function ensureCampaignShell(
  tx: Prisma.TransactionClient,
  project: NonNullable<Awaited<ReturnType<typeof ownedProject>>>,
) {
  return tx.campaign.upsert({
    where: { legacyProjectId: project.id },
    create: {
      id: project.id,
      legacyProjectId: project.id,
      ownerUserId: project.userId,
      name: project.name,
      campaignType: project.campaignType,
      legacyChain: project.chain,
      networks: normalizeCampaignNetworks(project.chain),
      lifecycle: "active",
      notes: project.notes,
      metadata: {
        schemaVersion: "tri-proof-campaign-core-v1",
        source: "campaign-operations-v1-bridge",
      },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    update: {
      ownerUserId: project.userId,
      name: project.name,
      campaignType: project.campaignType,
      legacyChain: project.chain,
    },
  })
}

export async function activateCampaignPolicyVersion(
  tx: Prisma.TransactionClient,
  input: {
    campaignId: string
    userId: string
    actor: Actor
    preset: unknown
    rationale: unknown
    source: string
  },
) {
  const project = await ownedProject(tx, input.campaignId, input.userId)
  if (!project) throw new CampaignOperationError("Campaign not found", "CAMPAIGN_NOT_FOUND", 404)

  const campaign = await ensureCampaignShell(tx, project)
  const activePolicy = await tx.campaignPolicy.findFirst({
    where: { campaignId: campaign.id, isActive: true },
    orderBy: { version: "desc" },
    select: { id: true, preset: true, version: true, policyHash: true },
  })
  const currentPreset = storedRiskPolicy(activePolicy?.preset) ?? riskPolicyFromNotes(project.notes)
  const normalized = normalizeCampaignPolicyChange(
    { preset: input.preset, rationale: input.rationale },
    { preset: currentPreset, lifecycle: campaign.lifecycle },
  )
  if (!normalized.value) {
    throw new CampaignOperationError(
      normalized.error,
      normalized.code,
      operationStatus(normalized.code),
    )
  }

  const latest = await tx.campaignPolicy.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  const version = (latest?.version ?? 0) + 1
  const definition = {
    ...buildPersistedCampaignPolicyDefinition(normalized.value.preset),
    activationAudit: {
      schemaVersion: CAMPAIGN_OPERATIONS_SCHEMA_VERSION,
      source: input.source,
      actorId: input.actor.id,
      actorName: input.actor.name,
      rationale: normalized.value.rationale,
      previousPolicyId: activePolicy?.id ?? null,
      previousPolicyVersion: activePolicy?.version ?? null,
      previousPreset: currentPreset,
      activatedAt: new Date().toISOString(),
    },
  } as Prisma.InputJsonValue

  await tx.campaignPolicy.updateMany({
    where: { campaignId: campaign.id, isActive: true },
    data: { isActive: false },
  })

  const policy = await tx.campaignPolicy.create({
    data: {
      campaignId: campaign.id,
      name: `${normalized.value.preset[0].toUpperCase()}${normalized.value.preset.slice(1)} campaign policy`,
      version,
      preset: normalized.value.preset,
      policyHash: persistedPolicyHash(normalized.value.preset),
      definition,
      isActive: true,
    },
  })

  const notes = replaceRiskPolicyMarker(project.notes, normalized.value.preset)
  await Promise.all([
    tx.project.update({ where: { id: project.id }, data: { notes } }),
    tx.campaign.update({ where: { id: campaign.id }, data: { notes } }),
  ])

  return {
    campaignId: campaign.id,
    previousPolicy: activePolicy
      ? {
          id: activePolicy.id,
          preset: currentPreset,
          version: activePolicy.version,
          policyHash: activePolicy.policyHash,
        }
      : null,
    policy: {
      id: policy.id,
      preset: normalized.value.preset,
      version: policy.version,
      policyHash: policy.policyHash,
      rationale: normalized.value.rationale,
      createdAt: policy.createdAt,
    },
    boundaries: {
      recomputedStoredDecisions: false,
      affectedExistingAnalysisRuns: false,
      appliesToFutureRuns: true,
    },
  }
}

export async function changeCampaignLifecycle(
  tx: Prisma.TransactionClient,
  input: {
    campaignId: string
    userId: string
    actor: Actor
    lifecycle: unknown
    source: string
  },
) {
  const project = await ownedProject(tx, input.campaignId, input.userId)
  if (!project) throw new CampaignOperationError("Campaign not found", "CAMPAIGN_NOT_FOUND", 404)

  const campaign = await ensureCampaignShell(tx, project)
  const normalized = normalizeCampaignLifecycleChange(
    { lifecycle: input.lifecycle },
    campaign.lifecycle,
  )
  if (!normalized.value) {
    throw new CampaignOperationError(
      normalized.error,
      normalized.code,
      operationStatus(normalized.code),
    )
  }

  const previousLifecycle = campaign.lifecycle
  const existingMetadata = metadataObject(campaign.metadata)
  const updated = await tx.campaign.update({
    where: { id: campaign.id },
    data: {
      lifecycle: normalized.value.lifecycle,
      metadata: {
        ...existingMetadata,
        schemaVersion:
          typeof existingMetadata.schemaVersion === "string"
            ? existingMetadata.schemaVersion
            : "tri-proof-campaign-core-v1",
        lastLifecycleChange: {
          schemaVersion: CAMPAIGN_OPERATIONS_SCHEMA_VERSION,
          source: input.source,
          actorId: input.actor.id,
          actorName: input.actor.name,
          from: previousLifecycle,
          to: normalized.value.lifecycle,
          changedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  })

  return {
    campaignId: updated.id,
    previousLifecycle: previousLifecycle as CampaignLifecycle,
    lifecycle: updated.lifecycle as CampaignLifecycle,
    boundaries: {
      changedWalletDecisions: false,
      changedPolicy: false,
      startedAnalysisRun: false,
    },
  }
}
