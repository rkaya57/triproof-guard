import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth/session"
import { loadCampaignDetail } from "@/lib/campaigns/load-campaign-detail"
import { normalizeCampaignNetworks } from "@/lib/campaigns/model"
import {
  assertCampaignDateWindow,
  campaignSettingsPatchSchema,
  normalizeCampaignSettingsPatch,
} from "@/lib/campaigns/settings"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

function prismaMetadata(value: Record<string, unknown> | null) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue)
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  try {
    const detail = await loadCampaignDetail(id, user.id)
    if (!detail) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Campaign is temporarily unavailable" }, { status: 503 })
    }
    console.error("Campaign load failed", { campaignId: id, error })
    return NextResponse.json({ error: "Campaign could not be loaded" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = campaignSettingsPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid campaign settings", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const patch = normalizeCampaignSettingsPatch(parsed.data)

  try {
    const project = await db.project.findFirst({
      where: { id, userId: user.id },
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

    if (!project) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const existing = await db.campaign.findUnique({
      where: { legacyProjectId: project.id },
      select: { startsAt: true, endsAt: true },
    })

    assertCampaignDateWindow(
      {
        startsAt: existing?.startsAt ?? null,
        endsAt: existing?.endsAt ?? null,
      },
      patch,
    )

    const defaultMetadata: Prisma.InputJsonValue = {
      schemaVersion: "tri-proof-campaign-core-v1",
      source: "campaign-settings-api",
    }

    await db.campaign.upsert({
      where: { legacyProjectId: project.id },
      create: {
        id: project.id,
        legacyProjectId: project.id,
        ownerUserId: project.userId,
        name: project.name,
        campaignType: project.campaignType,
        legacyChain: project.chain,
        networks: patch.networks ?? normalizeCampaignNetworks(project.chain),
        lifecycle: patch.lifecycle ?? "active",
        notes: project.notes,
        startsAt: patch.startsAt ?? null,
        endsAt: patch.endsAt ?? null,
        rewardPoolUsd: patch.rewardPoolUsd ?? null,
        metadata:
          patch.metadata === undefined ? defaultMetadata : prismaMetadata(patch.metadata),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      update: {
        ...(patch.lifecycle !== undefined ? { lifecycle: patch.lifecycle } : {}),
        ...(patch.networks !== undefined ? { networks: patch.networks } : {}),
        ...(patch.startsAt !== undefined ? { startsAt: patch.startsAt } : {}),
        ...(patch.endsAt !== undefined ? { endsAt: patch.endsAt } : {}),
        ...(patch.rewardPoolUsd !== undefined ? { rewardPoolUsd: patch.rewardPoolUsd } : {}),
        ...(patch.metadata !== undefined
          ? { metadata: prismaMetadata(patch.metadata) }
          : {}),
      },
    })

    const detail = await loadCampaignDetail(project.id, user.id)
    return NextResponse.json(detail)
  } catch (error) {
    if (error instanceof Error && /end date must be/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Campaign settings are temporarily unavailable" }, { status: 503 })
    }
    console.error("Campaign settings update failed", { campaignId: id, error })
    return NextResponse.json({ error: "Campaign settings could not be updated" }, { status: 500 })
  }
}
