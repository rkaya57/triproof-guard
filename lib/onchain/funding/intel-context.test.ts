import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fundingContextKey } from "@/lib/graph-intelligence"
import { buildFundingRelationshipContext } from "@/lib/onchain/funding/intel-context"

const evmFunder = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"
const solanaFunder = "7YttLkHDoB9hPjDVHj7A9QqPmg4rS7P2SmQ6fD7YbUpN"

function observation(funderAddress: string, chain: string) {
  return { funderAddress, chain }
}

describe("funding relationship intel context", () => {
  it("matches EVM-wide trusted intel case-insensitively", () => {
    const context = buildFundingRelationshipContext(
      [observation(evmFunder, "Base")],
      [{
        normalized: evmFunder.toLowerCase(),
        chain: "EVM",
        verdict: "TRUSTED",
        label: "Approved distributor",
      }],
    )

    assert.equal(
      context.trustedFundingSources?.[fundingContextKey(evmFunder, "Base")],
      "Approved distributor",
    )
  })

  it("preserves exact Solana Base58 identity", () => {
    const context = buildFundingRelationshipContext(
      [observation(solanaFunder, "Solana")],
      [{
        normalized: solanaFunder,
        chain: "Solana",
        verdict: "KNOWN_BAD",
        label: "Confirmed attacker treasury",
      }],
    )

    assert.equal(
      context.knownBadFundingSources?.[fundingContextKey(solanaFunder, "Solana")],
      "Confirmed attacker treasury",
    )
  })

  it("rejects ambiguous legacy folded Solana matches", () => {
    const lower = solanaFunder.toLowerCase()
    const context = buildFundingRelationshipContext(
      [observation(solanaFunder, "Solana")],
      [
        {
          normalized: lower,
          chain: "Solana",
          verdict: "TRUSTED",
          label: "Legacy A",
        },
        {
          normalized: solanaFunder,
          chain: "Solana",
          verdict: "KNOWN_BAD",
          label: "Exact B",
        },
      ],
    )

    // Exact case-sensitive match is allowed and wins before any folded fallback.
    assert.equal(
      context.knownBadFundingSources?.[fundingContextKey(solanaFunder, "Solana")],
      "Exact B",
    )

    const ambiguousOnly = buildFundingRelationshipContext(
      [observation("7yttlkhdob9hpjdvhj7a9qqpmg4rs7p2smq6fd7ybupn", "Solana")],
      [
        {
          normalized: "7YttLkHDoB9hPjDVHj7A9QqPmg4rS7P2SmQ6fD7YbUpN",
          chain: "Solana",
          verdict: "TRUSTED",
          label: "Mixed case A",
        },
        {
          normalized: "7yttLkHDoB9hPjDVHj7A9QqPmg4rS7P2SmQ6fD7YbUpN",
          chain: "Solana",
          verdict: "KNOWN_BAD",
          label: "Mixed case B",
        },
      ],
    )
    assert.deepEqual(ambiguousOnly.trustedFundingSources, {})
    assert.deepEqual(ambiguousOnly.knownBadFundingSources, {})
  })

  it("gives KNOWN_BAD precedence over TRUSTED for the same funder", () => {
    const context = buildFundingRelationshipContext(
      [observation(evmFunder, "Ethereum")],
      [
        {
          normalized: evmFunder,
          chain: "Ethereum",
          verdict: "TRUSTED",
          label: "Old allowlist entry",
        },
        {
          normalized: evmFunder,
          chain: "Ethereum",
          verdict: "KNOWN_BAD",
          label: "Confirmed attacker treasury",
        },
      ],
    )
    const key = fundingContextKey(evmFunder, "Ethereum")

    assert.equal(context.knownBadFundingSources?.[key], "Confirmed attacker treasury")
    assert.equal(context.trustedFundingSources?.[key], undefined)
  })
})
