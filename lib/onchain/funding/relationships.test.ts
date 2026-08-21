import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeOnchainEvent } from "@/lib/onchain/events/normalize"
import type { RawOnchainObservation } from "@/lib/onchain/events/types"
import {
  deriveFundingRelationships,
  MAX_FUNDING_LINEAGE_HOPS,
} from "@/lib/onchain/funding/relationships"

const walletA = "0x1111111111111111111111111111111111111111"
const walletB = "0x2222222222222222222222222222222222222222"
const walletC = "0x3333333333333333333333333333333333333333"
const walletD = "0x4444444444444444444444444444444444444444"
const walletE = "0x5555555555555555555555555555555555555555"
const walletF = "0x6666666666666666666666666666666666666666"
const root = "0x7777777777777777777777777777777777777777"

function funding(
  walletAddress: string,
  funderAddress: string,
  txHash: string,
  observedAt = "2026-08-01T00:00:00.000Z",
) {
  return normalizeOnchainEvent({
    chain: "Ethereum",
    txHash,
    walletAddress,
    fromAddress: funderAddress,
    toAddress: walletAddress,
    kind: "native_transfer",
    assetSymbol: "ETH",
    amount: 0.1,
    observedAt,
    provider: "test",
    confidence: 95,
  } satisfies RawOnchainObservation)
}

describe("funding relationship engine", () => {
  it("creates FUNDED_BY evidence without treating one transfer as a Sybil conclusion", () => {
    const relationships = deriveFundingRelationships([
      funding(walletA, root, "0x01"),
    ])

    assert.equal(relationships.length, 1)
    const edge = relationships[0]
    assert.equal(edge?.kind, "FUNDED_BY")
    assert.equal(edge?.sourceAddress, walletA)
    assert.equal(edge?.targetAddress, root)
    assert.equal(edge?.riskBearing, false)
    assert.equal(edge?.hopCount, 1)
  })

  it("uses a bounded star topology for a corroboratable same-funder cohort", () => {
    const events = [
      funding(walletA, root, "0x11"),
      funding(walletB, root, "0x12"),
      funding(walletC, root, "0x13"),
    ]
    const relationships = deriveFundingRelationships(events)
    const sameFunder = relationships.filter((edge) => edge.kind === "SAME_FUNDER")

    assert.equal(sameFunder.length, 2)
    assert.ok(sameFunder.every((edge) => edge.cohortSize === 3))
    assert.ok(sameFunder.every((edge) => edge.riskBearing))
    assert.ok(sameFunder.every((edge) => edge.viaAddress === root))
  })

  it("does not make a two-wallet same-funder pattern risk-bearing", () => {
    const relationships = deriveFundingRelationships([
      funding(walletA, root, "0x21"),
      funding(walletB, root, "0x22"),
    ])
    const sameFunder = relationships.filter((edge) => edge.kind === "SAME_FUNDER")

    assert.equal(sameFunder.length, 1)
    assert.equal(sameFunder[0]?.riskBearing, false)
    assert.equal(sameFunder[0]?.suppressionReason, "insufficient_same_funder_cohort")
  })

  it("neutralizes known bridge fan-out even for a large funding cohort", () => {
    const optimismPortal = "0xbEb5Fc579115071764c7423A4f12eDde41f106Ed"
    const relationships = deriveFundingRelationships([
      funding(walletA, optimismPortal, "0x31"),
      funding(walletB, optimismPortal, "0x32"),
      funding(walletC, optimismPortal, "0x33"),
      funding(walletD, optimismPortal, "0x34"),
    ])
    const sameFunder = relationships.filter((edge) => edge.kind === "SAME_FUNDER")

    assert.equal(sameFunder.length, 3)
    assert.ok(sameFunder.every((edge) => !edge.riskBearing))
    assert.ok(
      sameFunder.every((edge) => edge.suppressionReason === "neutral_infrastructure_fanout"),
    )
  })

  it("derives a shared two-hop funding lineage across distinct direct funders", () => {
    const relationships = deriveFundingRelationships([
      funding(walletA, walletB, "0x41"),
      funding(walletB, root, "0x42"),
      funding(walletC, walletD, "0x43"),
      funding(walletD, root, "0x44"),
      funding(walletE, walletF, "0x45"),
      funding(walletF, root, "0x46"),
    ])
    const lineage = relationships.filter((edge) => edge.kind === "SAME_FUNDING_LINEAGE")

    assert.equal(lineage.length, 2)
    assert.ok(lineage.every((edge) => edge.viaAddress === root))
    assert.ok(lineage.every((edge) => edge.hopCount === 2))
    assert.ok(lineage.every((edge) => edge.cohortSize === 3))
    assert.ok(lineage.every((edge) => edge.riskBearing))
    assert.ok(lineage.every((edge) => edge.evidenceEventKeys.length === 4))
  })

  it("caps lineage expansion and stops cycles", () => {
    const chain = [walletA, walletB, walletC, walletD, walletE, walletF, root]
    const events = chain.slice(0, -1).map((wallet, index) =>
      funding(wallet, chain[index + 1] as string, `0x5${index}`),
    )
    // Add a cycle at the tail. The engine must stop rather than recurse forever.
    events.push(funding(root, walletF, "0x5f"))

    const relationships = deriveFundingRelationships(events)
    assert.ok(relationships.every((edge) => edge.hopCount <= MAX_FUNDING_LINEAGE_HOPS))
  })

  it("keeps large same-funder cohorts linear instead of generating all wallet pairs", () => {
    const events = Array.from({ length: 100 }, (_, index) =>
      funding(
        `0x${(index + 100).toString(16).padStart(40, "0")}`,
        root,
        `0x${(index + 1000).toString(16)}`,
      ),
    )
    const relationships = deriveFundingRelationships(events)
    assert.equal(
      relationships.filter((edge) => edge.kind === "SAME_FUNDER").length,
      99,
    )
  })
})
