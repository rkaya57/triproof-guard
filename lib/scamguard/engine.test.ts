import test from "node:test"
import assert from "node:assert/strict"

import { scanScamGuard } from "./engine"

test("ScamGuard flags known scam domains as critical", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://airdrop.orbition.network/",
    chain: "solana",
  })

  assert.equal(result.riskLevel, "CRITICAL")
  assert.equal(result.metadata.chain, "solana")
  assert.equal(result.metadata.reputation?.verdict, "known_bad")
  assert.ok(result.signals.some((signal) => signal.code === "KNOWN_SCAM_DOMAIN"))
})

test("ScamGuard reduces false positives for verified domains", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://zerg.app/",
    chain: "solana",
  })

  assert.equal(result.riskLevel, "SAFE")
  assert.equal(result.metadata.reputation?.verdict, "trusted")
  assert.ok(result.signals.some((signal) => signal.code === "VERIFIED_PROJECT_DOMAIN"))
})

test("ScamGuard treats verified reward subdomains as safe context", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://app.allox.ai/rewards",
    chain: "evm",
  })

  assert.equal(result.riskLevel, "SAFE")
  assert.equal(result.metadata.reputation?.verdict, "trusted")
  assert.ok(result.signals.some((signal) => signal.code === "VERIFIED_PROJECT_DOMAIN"))
  assert.ok(result.signals.some((signal) => signal.code === "VERIFIED_REWARD_SURFACE"))
  assert.ok(!result.signals.some((signal) => signal.code === "CLAIM_LANGUAGE"))
  assert.ok(!result.signals.some((signal) => signal.code === "UNVERIFIED_CLAIM_DOMAIN"))
  assert.ok(!result.signals.some((signal) => signal.code === "UNVERIFIED_WEB3_APP_SURFACE"))
})

test("ScamGuard does not penalize verified airdrop subdomains for campaign wording", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://airdrop.shiftrwa.xyz/loyalty",
    chain: "evm",
  })

  assert.equal(result.riskLevel, "SAFE")
  assert.equal(result.metadata.reputation?.verdict, "trusted")
  assert.ok(result.signals.some((signal) => signal.code === "VERIFIED_PROJECT_DOMAIN"))
  assert.ok(result.signals.some((signal) => signal.code === "VERIFIED_REWARD_SURFACE"))
  assert.ok(!result.signals.some((signal) => signal.code === "SUSPICIOUS_TLD_CLAIM"))
  assert.ok(!result.signals.some((signal) => signal.code === "UNVERIFIED_CLAIM_DOMAIN"))
})

test("ScamGuard decodes EVM approval style payloads", async () => {
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    walletAddress: "0x0000000000000000000000000000000000000001",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0x1111111111111111111111111111111111111111",
          data: "0x095ea7b3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      ],
    }),
  })

  assert.equal(result.metadata.chain, "evm")
  assert.equal(result.metadata.decodedIntent?.category, "approval")
  assert.ok(["HIGH_RISK", "CRITICAL"].includes(result.riskLevel))
  assert.ok(result.signals.some((signal) => signal.code === "EVM_APPROVAL"))
})
