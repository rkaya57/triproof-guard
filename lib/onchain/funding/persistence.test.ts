import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildPersistedFundingRelationshipRows } from "@/lib/onchain/funding/persistence"
import type { FundingRelationship } from "@/lib/onchain/funding/relationships"

const relationship: FundingRelationship = {
  schemaVersion: "tri-proof-funding-relationship-v1",
  relationshipKey: "rel-key",
  kind: "SAME_FUNDER",
  chain: "ethereum",
  sourceAddress: "0x1111111111111111111111111111111111111111",
  targetAddress: "0x2222222222222222222222222222222222222222",
  viaAddress: "0x3333333333333333333333333333333333333333",
  hopCount: 1,
  cohortSize: 3,
  confidence: 95,
  riskBearing: true,
  suppressionReason: null,
  evidenceEventKeys: ["event-b", "event-a", "event-a"],
  observedAt: "2026-08-01T00:00:00.000Z",
  metadata: { topology: "star", bigint: 42n },
}

describe("funding relationship persistence", () => {
  it("creates deterministic run-scoped persistence rows", () => {
    const first = buildPersistedFundingRelationshipRows("campaign-1", "run-1", [relationship])
    const second = buildPersistedFundingRelationshipRows("campaign-1", "run-1", [relationship])

    assert.equal(first.length, 1)
    assert.equal(first[0]?.id, second[0]?.id)
    assert.equal(first[0]?.campaignId, "campaign-1")
    assert.equal(first[0]?.analysisRunId, "run-1")
    assert.equal(first[0]?.kind, "SAME_FUNDER")
    assert.deepEqual(first[0]?.evidenceEventKeys, ["event-a", "event-b"])
    assert.equal(first[0]?.riskBearing, true)
    assert.equal(first[0]?.observedAt?.toISOString(), "2026-08-01T00:00:00.000Z")
    assert.deepEqual(first[0]?.metadata, { topology: "star", bigint: "42" })
  })

  it("clamps bounded relationship fields before database writes", () => {
    const row = buildPersistedFundingRelationshipRows("campaign-1", "run-1", [{
      ...relationship,
      hopCount: 99,
      cohortSize: 0,
      confidence: 400,
    }])[0]

    assert.equal(row?.hopCount, 5)
    assert.equal(row?.cohortSize, 1)
    assert.equal(row?.confidence, 100)
  })
})
