import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  claimEligibleForCohort,
  deduplicateLabelingCandidates,
  deterministicRealWorldSplit,
  opaqueId,
  selectChallengeCandidates,
  selectRepresentativeCandidates,
  type LabelingCandidateBase,
} from "./labeling-queue"

function candidate(
  overrides: Partial<LabelingCandidateBase> & Pick<LabelingCandidateBase, "walletId">
): LabelingCandidateBase {
  return {
    walletId: overrides.walletId,
    analysisId: overrides.analysisId ?? `analysis-${overrides.walletId}`,
    projectId: overrides.projectId ?? "project-a",
    chain: overrides.chain ?? "Ethereum",
    walletAddress:
      overrides.walletAddress ??
      `0x${overrides.walletId.padStart(40, "0").slice(-40)}`,
    createdAt: overrides.createdAt ?? new Date("2026-08-07T00:00:00.000Z"),
    engineStatus: overrides.engineStatus ?? "approved",
  }
}

describe("real-world blind labeling queue", () => {
  it("deduplicates repeated EVM wallets case-insensitively and keeps the newest record", () => {
    const older = candidate({
      walletId: "1",
      analysisId: "old",
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    })
    const newer = candidate({
      walletId: "2",
      analysisId: "new",
      walletAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
    })

    const selected = deduplicateLabelingCandidates([older, newer])
    assert.equal(selected.length, 1)
    assert.equal(selected[0]?.analysisId, "new")
  })

  it("keeps Solana addresses case-sensitive", () => {
    const first = candidate({
      walletId: "sol-1",
      chain: "Solana",
      walletAddress: "AbCdEf123456789",
    })
    const second = candidate({
      walletId: "sol-2",
      chain: "Solana",
      walletAddress: "abcdef123456789",
    })

    assert.equal(deduplicateLabelingCandidates([first, second]).length, 2)
  })

  it("selects representative cases without depending on engine status", () => {
    const base = Array.from({ length: 12 }, (_, index) =>
      candidate({
        walletId: String(index + 1),
        projectId: index < 6 ? "project-a" : "project-b",
        engineStatus: index % 2 === 0 ? "approved" : "rejected",
      })
    )
    const inverted = base.map((item) => ({
      ...item,
      engineStatus: item.engineStatus === "approved" ? "rejected" : "approved",
    }))

    const first = selectRepresentativeCandidates(base, 3).map(
      (item) => item.walletId
    )
    const second = selectRepresentativeCandidates(inverted, 3).map(
      (item) => item.walletId
    )

    assert.deepEqual(first, second)
    assert.equal(first.length, 6)
  })

  it("keeps challenge cases separate and explicitly non-claim-eligible", () => {
    const values = Array.from({ length: 18 }, (_, index) =>
      candidate({
        walletId: String(index + 1),
        projectId: index < 9 ? "project-a" : "project-b",
        chain: index % 3 === 0 ? "Solana" : "Ethereum",
        engineStatus:
          index % 3 === 0
            ? "manual_review"
            : index % 2 === 0
              ? "rejected"
              : "approved",
      })
    )
    const representative = selectRepresentativeCandidates(values, 2)
    const challenge = selectChallengeCandidates(values, representative, 8)
    const representativeKeys = new Set(
      representative.map((item) => `${item.analysisId}:${item.walletId}`)
    )

    assert.ok(challenge.length > 0)
    assert.ok(
      challenge.every(
        (item) => !representativeKeys.has(`${item.analysisId}:${item.walletId}`)
      )
    )
    assert.equal(claimEligibleForCohort("representative"), true)
    assert.equal(claimEligibleForCohort("challenge"), false)
  })

  it("assigns related group keys deterministically to a single split", () => {
    const group = "project-stable-group"
    const first = deterministicRealWorldSplit(group)
    const second = deterministicRealWorldSplit(group)
    assert.equal(first, second)
    assert.ok(["development", "validation", "holdout"].includes(first))
  })

  it("produces opaque identifiers without leaking raw project ids", () => {
    const id = opaqueId("rg", "cm-secret-project-id")
    assert.match(id, /^rg-[a-f0-9]{16}$/)
    assert.equal(id.includes("cm-secret-project-id"), false)
  })
})
