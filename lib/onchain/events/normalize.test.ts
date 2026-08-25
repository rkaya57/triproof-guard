import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  extractFundingObservations,
  normalizeOnchainChain,
  normalizeOnchainEvent,
} from "@/lib/onchain/events/normalize"

describe("normalized on-chain events", () => {
  it("canonicalizes EVM addresses and infers inbound transfers", () => {
    const event = normalizeOnchainEvent({
      chain: "Base",
      txHash: "0xTXABC",
      eventIndex: 3,
      walletAddress: "0xAbC",
      fromAddress: "0xDeF",
      toAddress: "0xABC",
      kind: "native_transfer",
      assetSymbol: "ETH",
      amount: "0.25",
      observedAt: "2026-08-21T10:00:00Z",
      blockRef: 12345,
      provider: "alchemy",
      confidence: 91.4,
    })

    assert.equal(event.chain, "base")
    assert.equal(event.chainFamily, "evm")
    assert.equal(event.walletAddress, "0xabc")
    assert.equal(event.fromAddress, "0xdef")
    assert.equal(event.toAddress, "0xabc")
    assert.equal(event.counterpartyAddress, "0xdef")
    assert.equal(event.direction, "inbound")
    assert.equal(event.amount, "0.25")
    assert.equal(event.blockRef, "12345")
    assert.equal(event.confidence, 91)
    assert.equal(event.eventKey.length, 64)
  })

  it("preserves Solana base58 casing and infers outbound transfers", () => {
    const event = normalizeOnchainEvent({
      chain: "Solana",
      txHash: "5SolTx",
      walletAddress: "WalletAbCd123",
      fromAddress: "WalletAbCd123",
      toAddress: "FunderXyZ789",
      kind: "token_transfer",
      assetAddress: "MintAbCd456",
      amount: 12.5,
      observedAt: new Date("2026-08-21T10:01:00Z"),
      provider: "helius",
      confidence: 105,
    })

    assert.equal(event.chain, "solana")
    assert.equal(event.chainFamily, "solana")
    assert.equal(event.walletAddress, "WalletAbCd123")
    assert.equal(event.counterpartyAddress, "FunderXyZ789")
    assert.equal(event.assetAddress, "MintAbCd456")
    assert.equal(event.direction, "outbound")
    assert.equal(event.amount, "12.5")
    assert.equal(event.confidence, 100)
  })

  it("produces deterministic event keys after canonicalization", () => {
    const first = normalizeOnchainEvent({
      chain: "ETH",
      txHash: "0xABCDEF",
      eventIndex: 1,
      walletAddress: "0xAABB",
      fromAddress: "0xCCDD",
      toAddress: "0xAABB",
      kind: "native_transfer",
      provider: "etherscan",
    })
    const second = normalizeOnchainEvent({
      chain: "ethereum",
      txHash: "0xabcdef",
      eventIndex: 1,
      walletAddress: "0xaabb",
      fromAddress: "0xccdd",
      toAddress: "0xaabb",
      kind: "native_transfer",
      provider: "etherscan",
    })

    assert.equal(first.eventKey, second.eventKey)
  })

  it("extracts and orders only inbound funding transfers", () => {
    const laterFunding = normalizeOnchainEvent({
      chain: "Solana",
      txHash: "tx-later",
      walletAddress: "Wallet1",
      fromAddress: "FunderB",
      toAddress: "Wallet1",
      kind: "native_transfer",
      observedAt: "2026-08-21T10:05:00Z",
      provider: "helius",
      confidence: 90,
    })
    const interaction = normalizeOnchainEvent({
      chain: "Solana",
      txHash: "tx-interaction",
      walletAddress: "Wallet1",
      fromAddress: "Wallet1",
      toAddress: "Program1",
      kind: "contract_interaction",
      observedAt: "2026-08-21T10:02:00Z",
      provider: "helius",
      confidence: 80,
    })
    const firstFunding = normalizeOnchainEvent({
      chain: "Solana",
      txHash: "tx-first",
      walletAddress: "Wallet1",
      fromAddress: "FunderA",
      toAddress: "Wallet1",
      kind: "token_transfer",
      observedAt: "2026-08-21T10:01:00Z",
      provider: "helius",
      confidence: 95,
    })

    const funding = extractFundingObservations([laterFunding, interaction, firstFunding])

    assert.equal(funding.length, 2)
    assert.equal(funding[0]?.funderAddress, "FunderA")
    assert.equal(funding[1]?.funderAddress, "FunderB")
  })

  it("rejects unsupported networks instead of guessing a chain family", () => {
    assert.throws(() => normalizeOnchainChain("Bitcoin"), /unsupported/i)
  })

  it("degrades malformed optional values safely", () => {
    const event = normalizeOnchainEvent({
      chain: "Polygon",
      txHash: "0x123",
      walletAddress: "0xWallet",
      kind: "unknown",
      amount: -1,
      observedAt: "not-a-date",
      provider: "blockscout",
      confidence: -20,
    })

    assert.equal(event.amount, null)
    assert.equal(event.observedAt, null)
    assert.equal(event.confidence, 0)
    assert.equal(event.direction, "unknown")
  })
})
