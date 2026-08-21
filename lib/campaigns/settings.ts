import { z } from "zod"

import {
  CAMPAIGN_LIFECYCLES,
  normalizeCampaignNetworks,
  type CampaignLifecycle,
} from "@/lib/campaigns/model"

const dateInput = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date")

export const campaignSettingsPatchSchema = z
  .object({
    lifecycle: z.enum(CAMPAIGN_LIFECYCLES).optional(),
    networks: z.array(z.string().trim().min(1).max(64)).min(1).max(20).optional(),
    startsAt: dateInput.nullable().optional(),
    endsAt: dateInput.nullable().optional(),
    rewardPoolUsd: z.number().finite().min(0).max(1_000_000_000_000).nullable().optional(),
    metadata: z.record(z.string().max(128), z.unknown()).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one campaign setting is required")
  .refine(
    (value) => {
      if (!value.startsAt || !value.endsAt) return true
      return Date.parse(value.endsAt) >= Date.parse(value.startsAt)
    },
    { message: "Campaign end date must be on or after start date", path: ["endsAt"] },
  )

export type CampaignSettingsPatch = z.infer<typeof campaignSettingsPatchSchema>

export type NormalizedCampaignSettingsPatch = {
  lifecycle?: CampaignLifecycle
  networks?: string[]
  startsAt?: Date | null
  endsAt?: Date | null
  rewardPoolUsd?: number | null
  metadata?: Record<string, unknown> | null
}

export function normalizeCampaignSettingsPatch(
  patch: CampaignSettingsPatch,
): NormalizedCampaignSettingsPatch {
  const normalized: NormalizedCampaignSettingsPatch = {}

  if (patch.lifecycle !== undefined) normalized.lifecycle = patch.lifecycle

  if (patch.networks !== undefined) {
    const networks = normalizeCampaignNetworks("", patch.networks)
    if (networks.length === 0) throw new Error("At least one valid network is required")
    normalized.networks = networks
  }

  if (patch.startsAt !== undefined) {
    normalized.startsAt = patch.startsAt === null ? null : new Date(patch.startsAt)
  }
  if (patch.endsAt !== undefined) {
    normalized.endsAt = patch.endsAt === null ? null : new Date(patch.endsAt)
  }
  if (patch.rewardPoolUsd !== undefined) normalized.rewardPoolUsd = patch.rewardPoolUsd
  if (patch.metadata !== undefined) normalized.metadata = patch.metadata

  return normalized
}

export function assertCampaignDateWindow(
  current: { startsAt: Date | null; endsAt: Date | null },
  patch: NormalizedCampaignSettingsPatch,
) {
  const startsAt = patch.startsAt === undefined ? current.startsAt : patch.startsAt
  const endsAt = patch.endsAt === undefined ? current.endsAt : patch.endsAt

  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new Error("Campaign end date must be on or after start date")
  }
}
