import assert from "node:assert/strict"
import { test } from "node:test"

import type { ScamGuardScanResult } from "@/lib/scamguard/engine"

import { detectScanCandidate, formatTelegramScanReport, handleTelegramUpdate, type TelegramUpdate } from "./bot"

function fakeResult(overrides: Partial<ScamGuardScanResult> = {}): ScamGuardScanResult {
  return {
    id: "sg_test",
    type: "url",
    score: 86,
    riskLevel: "CRITICAL",
    summary: "Critical drain or account-takeover indicators were found.",
    confidence: "HIGH",
    explanation: "Local rules found a high-confidence risk pattern.",
    signals: [
      {
        code: "KNOWN_SCAM_DOMAIN",
        severity: "critical",
        title: "Known suspicious domain",
        detail: "airdrop.orbition.network is in ScamGuard's seed threat intelligence list.",
      },
    ],
    actions: [
      "Reject the transaction or close the page.",
      "Move funds to a fresh wallet if a seed phrase or private key was entered.",
    ],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      domain: "airdrop.orbition.network",
    },
    scannedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  }
}

test("Telegram bot detects URL scan candidates", () => {
  const candidate = detectScanCandidate("https://airdrop.orbition.network/")
  assert.equal(candidate?.type, "url")
  assert.equal(candidate?.chain, "unknown")
})

test("Telegram bot detects EVM transaction intent", () => {
  const candidate = detectScanCandidate("eth_sendTransaction 0x095ea7b3000000000000000000000000")
  assert.equal(candidate?.type, "transaction")
  assert.equal(candidate?.chain, "evm")
})

test("Telegram bot returns help for private /start", async () => {
  const update: TelegramUpdate = {
    update_id: 1,
    message: {
      message_id: 10,
      text: "/start",
      chat: { id: 123, type: "private" },
    },
  }

  const actions = await handleTelegramUpdate(update)
  assert.equal(actions.length, 1)
  assert.equal(actions[0].method, "sendMessage")
  assert.match(actions[0].payload.text, /SCAMGUARD TELEGRAM BETA/)
})

test("Telegram report uses premium English sections", () => {
  const text = formatTelegramScanReport(fakeResult(), { publicBaseUrl: "https://triproofprotocol.com" })
  assert.match(text, /ScamGuard Report/)
  assert.match(text, /\[ SUMMARY \]/)
  assert.match(text, /\[ EVIDENCE \]/)
  assert.match(text, /\[ RECOMMENDED ACTION \]/)
  assert.doesNotMatch(text, /Move funds to a fresh wallet/)
})

test("Telegram report keeps fresh-wallet action only for secret exposure", () => {
  const text = formatTelegramScanReport(
    fakeResult({
      signals: [
        {
          code: "SECRET_MATERIAL_REQUEST",
          severity: "critical",
          title: "Seed phrase or private key lure",
          detail: "Any request for recovery phrase, seed phrase, mnemonic, or private key is a critical compromise signal.",
        },
      ],
    })
  )
  assert.match(text, /Move funds to a fresh wallet/)
})

test("Telegram report classifies SPL program-owned accounts instead of treating them as normal wallets", () => {
  const text = formatTelegramScanReport(
    fakeResult({
      type: "wallet",
      score: 31,
      riskLevel: "CAUTION",
      summary: "This surface needs source verification before you click or sign.",
      confidence: "MEDIUM",
      explanation: "Solana scan found program-owned account.",
      signals: [
        {
          code: "PROGRAM_OWNED_ACCOUNT",
          severity: "medium",
          title: "Program-owned account",
          detail: "This account is owned by TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA, not the Solana system program.",
        },
      ],
      actions: ["Confirm the domain, token mint, and transaction instructions before proceeding."],
      metadata: {
        chain: "solana",
        rpcStatus: "checked",
        walletAddress: "Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs",
        ownerProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      },
    })
  )

  assert.match(text, /SPL TOKEN ACCOUNT DETECTED/)
  assert.match(text, /does not look like a normal end-user wallet/)
  assert.match(text, /Run \/token with this address/)
  assert.doesNotMatch(text, /Shield score: 31\/100/)
})

test("Group Guardian stays quiet for non-command text without links", async () => {
  const update: TelegramUpdate = {
    update_id: 2,
    message: {
      message_id: 11,
      text: "gm team",
      chat: { id: -100, type: "supergroup", title: "Test group" },
    },
  }

  const actions = await handleTelegramUpdate(update)
  assert.equal(actions.length, 0)
})

test("Group Guardian warns on known scam links", async () => {
  const update: TelegramUpdate = {
    update_id: 3,
    message: {
      message_id: 12,
      text: "claim here https://airdrop.orbition.network/",
      chat: { id: -100, type: "group", title: "Test group" },
    },
  }

  const actions = await handleTelegramUpdate(update)
  assert.equal(actions.length, 1)
  assert.match(actions[0].payload.text, /ScamGuard Group Guardian/)
})
