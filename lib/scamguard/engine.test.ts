import test from "node:test"
import assert from "node:assert/strict"

import { scanScamGuard } from "./engine"

const evmWord = (value: bigint) => value.toString(16).padStart(64, "0")
const evmAddressWord = (address: string) => address.toLowerCase().replace(/^0x/, "").padStart(64, "0")

test("ScamGuard flags an emergency known-bad domain as critical", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://phantom-airdrop-claim.example/",
    chain: "solana",
  })

  assert.equal(result.riskLevel, "CRITICAL")
  assert.equal(result.metadata.chain, "solana")
  assert.equal(result.metadata.reputation?.verdict, "known_bad")
  assert.ok(result.signals.some((signal) => signal.code === "KNOWN_SCAM_DOMAIN"))
})

test("ScamGuard does not ship unreviewed project domains as hard-coded stop signals", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://airdrop.orbition.network/",
    chain: "evm",
  })

  assert.notEqual(result.metadata.reputation?.source, "emergency_blocklist")
  assert.ok(!result.signals.some((signal) => signal.code === "KNOWN_SCAM_DOMAIN"))
})

test("ScamGuard keeps URL reports chain-neutral without an explicit or detected chain", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://app.pax.trading/",
  })

  assert.equal(result.metadata.chain, "unknown")
  assert.match(result.explanation, /^Web3 scan found /)
  assert.doesNotMatch(result.explanation, /^Solana scan found /)
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

test("ScamGuard does not over-penalize clean unknown rewards surfaces", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://app.exampleproject.io/dashboard/rewards",
    chain: "solana",
  })

  assert.equal(result.riskLevel, "SAFE")
  assert.equal(result.metadata.reputation?.verdict, "unknown")
  assert.ok(result.score <= 30)
  assert.ok(result.signals.some((signal) => signal.code === "CLAIM_LANGUAGE" && signal.severity === "low"))
  assert.ok(result.signals.some((signal) => signal.code === "UNVERIFIED_PROJECT_CONTEXT" && signal.severity === "low"))
  assert.ok(!result.signals.some((signal) => signal.code === "UNVERIFIED_CLAIM_DOMAIN"))
  assert.ok(!result.signals.some((signal) => signal.severity === "medium" || signal.severity === "high" || signal.severity === "critical"))
})

test("ScamGuard still escalates risky claim domains on suspicious TLDs", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://app.airdrop-bonus.xyz/rewards",
    chain: "evm",
  })

  assert.ok(["HIGH_RISK", "CAUTION"].includes(result.riskLevel))
  assert.ok(result.signals.some((signal) => signal.code === "SUSPICIOUS_TLD_CLAIM"))
  assert.ok(result.signals.some((signal) => signal.code === "UNVERIFIED_CLAIM_DOMAIN" && signal.severity === "medium"))
  assert.ok(result.signals.some((signal) => signal.code === "DRAINER_PATTERN" || signal.severity === "medium"))
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
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(BigInt(1))}`,
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

test("ScamGuard explains high-impact EIP-712 typed-data signatures", async () => {
  const verifyingContract = "0x2222222222222222222222222222222222222222"
  const result = await scanScamGuard({
    type: "transaction",
    chain: "evm",
    value: JSON.stringify({
      method: "eth_signTypedData_v4",
      params: [
        "0x1111111111111111111111111111111111111111",
        JSON.stringify({
          primaryType: "Permit",
          domain: { name: "Example Token", verifyingContract },
          message: { owner: "0x1111111111111111111111111111111111111111", spender: verifyingContract, value: "100" },
          types: { Permit: [] },
        }),
      ],
    }),
  })

  assert.equal(result.metadata.decodedIntent?.category, "signature")
  assert.equal(result.metadata.decodedIntent?.typedData?.primaryType, "Permit")
  assert.equal(result.metadata.decodedIntent?.typedData?.verifyingContract, verifyingContract)
  assert.ok(result.signals.some((signal) => signal.code === "HIGH_IMPACT_TYPED_DATA"))
})

test("ScamGuard includes bounded browser-observed safety signals in a URL decision", async () => {
  const result = await scanScamGuard({
    type: "url",
    value: "https://example.org/claim",
    clientSignals: [{ code: "SEED_PHRASE_FORM", detail: "A form asks for a recovery phrase." }],
  })

  assert.equal(result.riskLevel, "CRITICAL")
  assert.ok(result.signals.some((signal) => signal.code === "EXTENSION_SEED_PHRASE_FORM"))
  assert.deepEqual(result.metadata.extensionSignals, ["EXTENSION_SEED_PHRASE_FORM"])
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
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(BigInt(1))}`,
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
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(BigInt(1))}`,
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

test("ScamGuard classifies Solana message signatures for plain-language review", async () => {
  const result = await scanScamGuard({
    type: "transaction",
    chain: "solana",
    value: JSON.stringify({ method: "signMessage", message: "Login to trusted app" }),
  })

  assert.equal(result.metadata.decodedIntent?.category, "signature")
  assert.equal(result.metadata.decodedIntent?.method, "signMessage")
})

test("ScamGuard decodes extension-provided Solana transaction summaries", async () => {
  const result = await scanScamGuard({
    type: "transaction",
    chain: "solana",
    value: JSON.stringify({
      kind: "solana_wallet_request",
      method: "signTransaction",
      instructions: [{
        programId: "11111111111111111111111111111111",
        programLabel: "System Program",
        type: "transfer",
        keyCount: 2,
      }],
      serializedTransaction: "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }),
  })

  assert.equal(result.metadata.decodedIntent?.category, "transfer")
  assert.equal(result.metadata.decodedIntent?.method, "signTransaction")
})

test("ScamGuard preserves unknown Solana instruction context for plain-language signing review", async () => {
  const result = await scanScamGuard({
    type: "transaction",
    chain: "solana",
    value: JSON.stringify({
      kind: "solana_wallet_request",
      method: "signAndSendTransaction",
      instructionCount: 2,
      instructions: [
        { programId: "ComputeBudget111111111111111111111111111111", programLabel: "Compute Budget Program" },
        { programId: "Unknown111111111111111111111111111111111111", programLabel: "Unknown Solana program" },
      ],
    }),
  })

  assert.equal(result.metadata.decodedIntent?.category, "unknown")
  assert.equal(result.metadata.decodedIntent?.method, "signAndSendTransaction")
  assert.equal(result.metadata.decodedIntent?.instructionCount, 2)
  assert.deepEqual(result.metadata.decodedIntent?.programs, ["Compute Budget Program", "Unknown Solana program"])
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
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord((BigInt(1) << BigInt(256)) - BigInt(1))}`,
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
          data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(BigInt(10))}`,
        },
      ],
    }),
  })

  assert.equal(result.riskLevel, "CRITICAL")
  assert.equal(result.metadata.reputation?.verdict, "known_bad")
  assert.ok(result.signals.some((signal) => signal.code === "KNOWN_BAD_COUNTERPARTY"))
})
