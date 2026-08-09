import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  findSolanaWalletProvider,
  paymentMemoAccountMetas,
  solanaPayReferenceAccountMeta,
} from "./solana-wallet-client"

function provider(publicKey?: string) {
  return {
    publicKey: publicKey ? { toString: () => publicKey } : undefined,
    connect: async () => undefined,
    signAndSendTransaction: async () => ({ signature: "fixture-signature" }),
  }
}

describe("Solana checkout wallet discovery", () => {
  it("detects Phantom through its current namespaced provider", () => {
    const phantom = provider()
    assert.equal(findSolanaWalletProvider({ phantom: { solana: phantom } }), phantom)
  })

  it("detects Solflare and the legacy Solana provider", () => {
    const solflare = provider()
    const legacy = provider()

    assert.equal(findSolanaWalletProvider({ solflare }), solflare)
    assert.equal(findSolanaWalletProvider({ solana: legacy }), legacy)
  })

  it("prefers an already-connected provider when multiple wallets are installed", () => {
    const disconnectedLegacy = provider()
    const connectedPhantom = provider("connected-wallet")

    assert.equal(
      findSolanaWalletProvider({
        solana: disconnectedLegacy,
        phantom: { solana: connectedPhantom },
      }),
      connectedPhantom
    )
  })

  it("ignores incomplete injected objects", () => {
    assert.equal(
      findSolanaWalletProvider({ solana: { connect: async () => undefined } as never }),
      null
    )
  })
})

describe("Solana Pay checkout reference placement", () => {
  it("marks the checkout reference read-only and non-signer on the payment transfer", () => {
    const reference = {
      toString: () => "reference-key",
      toBuffer: () => new Uint8Array(32),
    }

    assert.deepEqual(solanaPayReferenceAccountMeta(reference), {
      pubkey: reference,
      isSigner: false,
      isWritable: false,
    })
  })

  it("never attaches the checkout reference to the SPL Memo instruction", () => {
    assert.deepEqual(paymentMemoAccountMetas(), [])
  })
})
