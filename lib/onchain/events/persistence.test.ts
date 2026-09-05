import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeOnchainEvent } from "@/lib/onchain/events/normalize"
import { buildPersistedEventRows } from "@/lib/onchain/events/persistence"

describe("normalized event persistence rows", () => {
  it("creates deterministic run-scoped rows with Decimal-safe amounts", () => {
    const event = normalizeOnchainEvent({
      chain: "Base",
      txHash: "0xABC",
      eventIndex: 4,
      walletAddress: "0xWallet",
      fromAddress: "0xFunder",
      toAddress: "0xWallet",
      kind: "native_transfer",
      amount: "1.250000000000000001",
      observedAt: "2026-08-21T10:00:00.000Z",
      provider: "alchemy",
      confidence: 94,
      metadata: {
        slotLikeValue: 123n,
        fetchedAt: new Date("2026-08-21T10:01:00.000Z"),
      },
    })

    const first = buildPersistedEventRows("run-1", [event])[0]
    const second = buildPersistedEventRows("run-1", [event])[0]
    const anotherRun = buildPersistedEventRows("run-2", [event])[0]

    assert.ok(first)
    assert.ok(second)
    assert.ok(anotherRun)
    assert.equal(first.id, second.id)
    assert.notEqual(first.id, anotherRun.id)
    assert.equal(first.analysisRunId, "run-1")
    assert.equal(first.amount?.toString(), "1.250000000000000001")
    assert.ok(first.observedAt instanceof Date)
    assert.equal(first.observedAt.toISOString(), "2026-08-21T10:00:00.000Z")
    assert.deepEqual(first.metadata, {
      slotLikeValue: "123",
      fetchedAt: "2026-08-21T10:01:00.000Z",
    })
  })
})
