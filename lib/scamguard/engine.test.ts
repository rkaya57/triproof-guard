import test from "node:test"
import assert from "node:assert/strict"

import { scanScamGuard } from "./engine"

const evmWord = (value: bigint) => value.toString(16).padStart(64, "0")
const evmAddressWord = (address: string) => address.toLowerCase().replace(/^0x/, "").padStart(64, "0")

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

test("ScamGuard treats Grass rewards as a verified project surface", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://app.grass.io/dashboard/rewards",
    chain: "solana",
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

test("ScamGuard detects obfuscated phishing URL techniques", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://phantom.app@xn--phantom-claim-123.example.xyz/claim/%2Fwallet?redirect=phantom://sign",
    chain: "evm",
  })

  assert.ok(["HIGH_RISK", "CRITICAL"].includes(result.riskLevel))
  assert.ok(result.signals.some((signal) => signal.code === "URL_CREDENTIALS_OBFUSCATION"))
  assert.ok(result.signals.some((signal) => signal.code === "PUNYCODE_DOMAIN"))
  assert.ok(result.signals.some((signal) => signal.code === "SENSITIVE_REDIRECT_PARAMETER"))
  assert.ok(result.metadata.domainIntelligence?.features.includes("url_credentials"))
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

test("ScamGuard decodes limited EVM approvals without escalating to critical", async () => {
  const spender = "0x2222222222222222222222222222222222222222"
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0x3333333333333333333333333333333333333333",
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(1n)}`,
        },
      ],
    }),
  })

  assert.equal(result.riskLevel, "CAUTION")
  assert.equal(result.metadata.decodedIntent?.spender, spender)
  assert.equal(result.metadata.decodedIntent?.amount, "1")
  assert.ok(result.signals.some((signal) => signal.code === "EVM_APPROVAL" && signal.severity === "medium"))
  assert.ok(result.signals.some((signal) => signal.code === "UNKNOWN_EVM_COUNTERPARTY"))
  assert.ok(!result.signals.some((signal) => signal.code === "UNLIMITED_EVM_APPROVAL"))
})

test("ScamGuard includes verified source context without hiding approval risk", async () => {
  const spender = "0x2222222222222222222222222222222222222222"
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    sourceUrl: "https://airdrop.shiftrwa.xyz/loyalty",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0x3333333333333333333333333333333333333333",
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(1n)}`,
        },
      ],
    }),
  })

  assert.equal(result.riskLevel, "CAUTION")
  assert.equal(result.metadata.domain, "airdrop.shiftrwa.xyz")
  assert.ok(result.signals.some((signal) => signal.code === "VERIFIED_TRANSACTION_SOURCE"))
  assert.ok(result.signals.some((signal) => signal.code === "EVM_APPROVAL"))
})

test("ScamGuard escalates transaction source redirect flows", async () => {
  const spender = "0x2222222222222222222222222222222222222222"
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    sourceUrl: "https://claim-drop.example.xyz/start?redirect=https://wallet.example/sign",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0x3333333333333333333333333333333333333333",
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(1n)}`,
        },
      ],
    }),
  })

  assert.equal(result.riskLevel, "CAUTION")
  assert.ok(result.signals.some((signal) => signal.code === "TRANSACTION_FROM_REDIRECT_FLOW"))
  assert.ok(result.metadata.domainIntelligence?.features.includes("sensitive_redirect"))
})

test("ScamGuard decodes structured Solana token instructions", async () => {
  const result = await scanScamGuard({
    type: "transaction",
    chain: "solana",
    value: JSON.stringify({
      transaction: {
        instructions: [
          {
            program: "spl-token",
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsed: {
              type: "approveChecked",
              info: {
                delegate: "Delegate111111111111111111111111111111111",
                amount: "100",
              },
            },
          },
        ],
      },
    }),
  })

  assert.equal(result.metadata.decodedIntent?.category, "approval")
  assert.ok(result.signals.some((signal) => signal.code === "DELEGATE_APPROVAL"))
  assert.ok(result.metadata.decision?.primaryReason)
})

test("ScamGuard escalates unlimited EVM approvals", async () => {
  const spender = "0x2222222222222222222222222222222222222222"
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0x3333333333333333333333333333333333333333",
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord((1n << 256n) - 1n)}`,
        },
      ],
    }),
  })

  assert.equal(result.riskLevel, "CRITICAL")
  assert.equal(result.metadata.decodedIntent?.spender, spender)
  assert.equal(result.metadata.decodedIntent?.amount, "115792089237316195423570985008687907853269984665640564039457584007913129639935")
  assert.ok(result.signals.some((signal) => signal.code === "UNLIMITED_EVM_APPROVAL"))
})

test("ScamGuard escalates approvals to known bad EVM counterparties", async () => {
  const spender = "0x000000000000000000000000000000000000bad1"
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [
        {
          to: "0x3333333333333333333333333333333333333333",
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(10n)}`,
        },
      ],
    }),
  })

  assert.equal(result.riskLevel, "CRITICAL")
  assert.equal(result.metadata.reputation?.verdict, "known_bad")
  assert.ok(result.signals.some((signal) => signal.code === "KNOWN_BAD_COUNTERPARTY"))
})
