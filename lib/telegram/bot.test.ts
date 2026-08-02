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
  assert.match(actions[0].payload.text, /SCAMGUARD BOT/)
})

test("Telegram report uses premium English sections", () => {
  const text = formatTelegramScanReport(fakeResult(), { publicBaseUrl: "https://triproofprotocol.com" })
  assert.match(text, /ScamGuard Report/)
  assert.match(text, /🛑 CRITICAL RISK/)
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
      text: "claim here https://phantom-airdrop-claim.example/",
      chat: { id: -100, type: "group", title: "Test group" },
    },
  }

  const actions = await handleTelegramUpdate(update)
  assert.equal(actions.length, 1)
  assert.match(actions[0].payload.text, /ScamGuard Group Guardian/)
})

test("Group scan commands enforce the same team policy used by API and Guardian links", async () => {
  const update: TelegramUpdate = {
    update_id: 31,
    message: {
      message_id: 121,
      text: "/scan https://phantom-airdrop-claim.example/",
      chat: { id: -100, type: "group", title: "Test group" },
    },
  }
  let recordedAlert = false
  const actions = await handleTelegramUpdate(update, {
    applyTeamPolicy: async () => ({ action: "REVIEW" as const, matched: [{ policyName: "Production policy", reason: "Project review is required." }] }),
    recordScan: async (input) => { recordedAlert = input.alerted; return { occurrenceCount: 1, repeatedCampaign: false } },
  })

  assert.equal(recordedAlert, true)
  assert.match(actions[0].payload.text, /TEAM POLICY: REVIEW/)
})

test("Group Guardian stays quiet when group protection is disabled", async () => {
  const update: TelegramUpdate = {
    update_id: 4,
    message: {
      message_id: 13,
      text: "claim here https://phantom-airdrop-claim.example/",
      chat: { id: -100, type: "supergroup", title: "Test group" },
    },
  }

  const actions = await handleTelegramUpdate(update, {
    groupSettings: {
      guardianEnabled: false,
      allowlisted: true,
      alertLevel: "CAUTION",
      dailySummary: true,
    },
  })
  assert.equal(actions.length, 0)
})

test("Group Guardian rejects settings changes from non-admin members", async () => {
  const update: TelegramUpdate = {
    update_id: 5,
    message: {
      message_id: 14,
      text: "/guardian threshold critical",
      chat: { id: -100, type: "supergroup", title: "Test group" },
      from: { id: 42, first_name: "Member" },
    },
  }

  const actions = await handleTelegramUpdate(update, {
    isGroupAdmin: async () => false,
  })
  assert.equal(actions.length, 1)
  assert.match(actions[0].payload.text, /Only a verified Telegram group administrator/)
})

test("Group Guardian lets verified admins change the alert threshold", async () => {
  const update: TelegramUpdate = {
    update_id: 6,
    message: {
      message_id: 15,
      text: "/guardian threshold critical",
      chat: { id: -100, type: "supergroup", title: "Test group" },
      from: { id: 7, first_name: "Admin" },
    },
  }
  let savedLevel = ""

  const actions = await handleTelegramUpdate(update, {
    isGroupAdmin: async () => true,
    updateGroupSettings: async (_chatId, values) => {
      savedLevel = values.alertLevel ?? ""
      return {
        guardianEnabled: true,
        allowlisted: true,
        alertLevel: values.alertLevel ?? "HIGH_RISK",
        dailySummary: true,
      }
    },
  })

  assert.equal(savedLevel, "CRITICAL")
  assert.match(actions[0].payload.text, /Alert threshold: CRITICAL/)
})

test("Group Guardian lets a verified admin connect a paid group", async () => {
  const update: TelegramUpdate = {
    update_id: 61,
    message: {
      message_id: 151,
      text: "/guardian connect TPG-ABC123",
      chat: { id: -101, type: "supergroup", title: "Paid group" },
      from: { id: 7, first_name: "Admin" },
    },
  }
  const actions = await handleTelegramUpdate(update, {
    isGroupAdmin: async () => true,
    claimGroup: async (_chatId, code) => ({ ok: code === "tpg-abc123", title: "Paid group", plan: "Community" }),
  })
  assert.match(actions[0].payload.text, /GROUP GUARDIAN CONNECTED/)
  assert.match(actions[0].payload.text, /Community plan/)
})

test("Group Guardian enforces the paid administrator slot limit", async () => {
  const update: TelegramUpdate = {
    update_id: 62,
    message: {
      message_id: 152,
      text: "/guardian threshold caution",
      chat: { id: -102, type: "supergroup", title: "Limited group" },
      from: { id: 9, first_name: "Extra admin" },
    },
  }
  const actions = await handleTelegramUpdate(update, {
    isGroupAdmin: async () => true,
    authorizeGroupManager: async () => false,
  })
  assert.match(actions[0].payload.text, /limited number of Group Guardian administrators/)
})

test("Group Guardian includes a repeated campaign escalation", async () => {
  const update: TelegramUpdate = {
    update_id: 7,
    message: {
      message_id: 16,
      text: "claim here https://phantom-airdrop-claim.example/",
      chat: { id: -100, type: "group", title: "Test group" },
    },
  }

  const actions = await handleTelegramUpdate(update, {
    recordScan: async () => ({ occurrenceCount: 3, repeatedCampaign: true }),
  })

  assert.equal(actions.length, 1)
  assert.match(actions[0].payload.text, /REPEATED CAMPAIGN/)
  assert.match(actions[0].payload.text, /appeared 3 times/)
})

test("Group Guardian offers a time-limited moderation action for repeated high-risk senders", async () => {
  const update: TelegramUpdate = {
    update_id: 71,
    message: {
      message_id: 171,
      text: "claim here https://phantom-airdrop-claim.example/",
      chat: { id: -100, type: "group", title: "Test group" },
      from: { id: 55, first_name: "Repeated sender" },
    },
  }
  const actions = await handleTelegramUpdate(update, {
    publicBaseUrl: "https://triproofprotocol.com",
    recordScan: async () => ({
      eventId: "evt-guard-1",
      occurrenceCount: 2,
      repeatedCampaign: false,
      senderBehavior: { recentPosts: 3, highRiskPosts: 2, repeatTargetPosts: 2, moderationRecommended: true },
    }),
  })
  assert.match(actions[0].payload.text, /SENDER BEHAVIOR/)
  assert.equal(actions[0].payload.reply_markup?.inline_keyboard[0][0].callback_data, "sg_mute:evt-guard-1:1")
  assert.equal(actions[0].payload.reply_markup?.inline_keyboard[0][1].callback_data, "sg_mute:evt-guard-1:24")
})

test("Group Guardian auto-contains a secret-material request from a non-admin sender", async () => {
  const update: TelegramUpdate = {
    update_id: 72,
    message: {
      message_id: 172,
      text: "Support needs your seed phrase to recover your wallet.",
      chat: { id: -100, type: "group", title: "Test group" },
      from: { id: 56, first_name: "Risky sender" },
    },
  }
  let mutedFor = 0
  const actions = await handleTelegramUpdate(update, {
    groupSettings: { guardianEnabled: true, allowlisted: true, alertLevel: "HIGH_RISK", dailySummary: true, autoMuteCritical: true },
    isGroupAdmin: async () => false,
    muteMember: async (_chatId, _userId, seconds) => { mutedFor = seconds; return true },
  })

  assert.equal(mutedFor, 60 * 60)
  assert.equal(actions.length, 1)
  assert.match(actions[0].payload.text, /Secret material request/)
  assert.match(actions[0].payload.text, /AUTO-CONTAINMENT/)
})

test("Group Guardian lets a verified admin toggle auto-containment", async () => {
  const update: TelegramUpdate = {
    update_id: 73,
    message: {
      message_id: 173,
      text: "/guardian automute on",
      chat: { id: -100, type: "group", title: "Test group" },
      from: { id: 7, first_name: "Admin" },
    },
  }
  let enabled = false
  const actions = await handleTelegramUpdate(update, {
    isGroupAdmin: async () => true,
    updateGroupSettings: async (_chatId, values) => {
      enabled = values.autoMuteCritical === true
      return { guardianEnabled: true, allowlisted: true, alertLevel: "HIGH_RISK", dailySummary: true, autoMuteCritical: enabled }
    },
  })

  assert.equal(enabled, true)
  assert.match(actions[0].payload.text, /Auto-containment: ON/)
})

test("Telegram history command renders persisted scan history", async () => {
  const update: TelegramUpdate = {
    update_id: 8,
    message: {
      message_id: 17,
      text: "/history",
      chat: { id: 123, type: "private" },
    },
  }

  const actions = await handleTelegramUpdate(update, {
    loadHistory: async () => [
      {
        target: "https://airdrop.orbition.network/",
        domain: "airdrop.orbition.network",
        scanType: "url",
        riskLevel: "CRITICAL",
        score: 8,
        alerted: true,
        createdAt: new Date("2026-07-28T12:00:00.000Z"),
      },
    ],
  })

  assert.match(actions[0].payload.text, /SCAMGUARD SCAN HISTORY/)
  assert.match(actions[0].payload.text, /airdrop\.orbition\.network/)
  assert.match(actions[0].payload.text, /CRITICAL \| 8\/100/)
})
