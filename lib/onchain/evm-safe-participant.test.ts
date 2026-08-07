import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { analyzeWallets } from "@/lib/risk-engine"
import type { ParsedWallet } from "@/types"

function evmWallet(overrides: Partial<ParsedWallet> = {}): ParsedWallet {
  return {
    walletAddress: "0x1111111111111111111111111111111111111111",
    chain: "Ethereum",
    txCount: 120,
    walletAgeDays: 500,
    fundingSource: "0x9999999999999999999999999999999999999999",
    firstFundingAt: "2025-01-01T00:00:00.000Z",
    firstFundingAmount: 1,
    historyTruncated: false,
    firstSeen: "2025-01-01T00:00:00.000Z",
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 5000,
    contractsCount: 20,
    campaignActionsCount: 1,
    nativeBalance: 2,
    tokenCount: 12,
    uniqueCounterparties: 80,
    lastActiveDaysAgo: 6,
    isContract: true,
    knownEntityLabel: null,
    knownEntityType: "user",
    accountType: null,
    evmDeployerAddress: "0x8888888888888888888888888888888888888888",
    evmFactoryAddress: "0xc22834581ebc8527d974f8a1c97e1bea4ef910bc",
    evmImplementationAddress: "0x7777777777777777777777777777777777777777",
    evmContractKind: "safe_multisig",
    behaviorFingerprint: ["swap", "stake", "bridge", "transfer"],
    campaignQualityScore: 92,
    campaignOnlyRatio: 0.01,
    behaviorDiversityScore: 90,
    botScriptScore: 5,
    enrichmentProvider: "etherscan",
    enrichmentStatus: "completed",
    ...overrides,
  }
}

describe("EVM Safe participant semantics", () => {
  it("does not reject a verified Safe merely because it has contract bytecode", () => {
    const result = analyzeWallets([evmWallet()])
    const wallet = result.wallets[0]

    assert.equal(wallet?.entityType, "user")
    assert.notEqual(wallet?.status, "rejected")
    assert.equal(wallet?.evmContractKind, "safe_multisig")
    assert.ok(
      result.graph.edges
        .filter((edge) => edge.kind === "created_by_factory" || edge.kind === "proxy_implementation")
        .every((edge) => edge.isRiskBearing === false)
    )
  })

  it("keeps a generic multisig contract outside normal end-user eligibility", () => {
    const result = analyzeWallets([
      evmWallet({
        walletAddress: "0x2222222222222222222222222222222222222222",
        knownEntityType: "contract",
        evmContractKind: "multisig",
        evmFactoryAddress: null,
      }),
    ])
    const wallet = result.wallets[0]

    assert.equal(wallet?.entityType, "contract")
    assert.equal(wallet?.status, "rejected")
    assert.match(wallet?.statusExplanation ?? "", /not eligible|known contract/i)
  })
})
