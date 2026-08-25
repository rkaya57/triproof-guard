import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertCampaignDateWindow,
  campaignSettingsPatchSchema,
  normalizeCampaignSettingsPatch,
} from "@/lib/campaigns/settings"

describe("campaign settings", () => {
  it("normalizes networks and campaign dates", () => {
    const parsed = campaignSettingsPatchSchema.parse({
      lifecycle: "paused",
      networks: ["Solana", "SOL", "Base"],
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T23:59:59.000Z",
      rewardPoolUsd: 250000,
    })

    const normalized = normalizeCampaignSettingsPatch(parsed)
    assert.equal(normalized.lifecycle, "paused")
    assert.deepEqual(normalized.networks, ["solana", "base"])
    assert.equal(normalized.startsAt?.toISOString(), "2026-09-01T00:00:00.000Z")
    assert.equal(normalized.endsAt?.toISOString(), "2026-09-30T23:59:59.000Z")
    assert.equal(normalized.rewardPoolUsd, 250000)
  })

  it("rejects empty updates and inverted date windows", () => {
    assert.equal(campaignSettingsPatchSchema.safeParse({}).success, false)
    assert.equal(
      campaignSettingsPatchSchema.safeParse({
        startsAt: "2026-10-01T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
      }).success,
      false,
    )
  })

  it("checks a partial date patch against persisted dates", () => {
    assert.throws(
      () =>
        assertCampaignDateWindow(
          {
            startsAt: new Date("2026-09-10T00:00:00.000Z"),
            endsAt: new Date("2026-09-30T00:00:00.000Z"),
          },
          { endsAt: new Date("2026-09-01T00:00:00.000Z") },
        ),
      /end date/i,
    )
  })

  it("allows explicit clearing of optional campaign values", () => {
    const parsed = campaignSettingsPatchSchema.parse({
      startsAt: null,
      endsAt: null,
      rewardPoolUsd: null,
      metadata: null,
    })

    assert.deepEqual(normalizeCampaignSettingsPatch(parsed), {
      startsAt: null,
      endsAt: null,
      rewardPoolUsd: null,
      metadata: null,
    })
  })
})
