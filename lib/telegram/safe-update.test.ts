import assert from "node:assert/strict"
import test from "node:test"

import { extractAdvancedScanCandidates } from "@/lib/telegram/guardian-v2"
import {
  handleTelegramUpdate,
  maskBenignSecretMaterialMentions,
  normalizeTelegramUpdate,
  normalizeTelegramUrl,
} from "@/lib/telegram/safe-update"

test("normalizes bare Telegram domains before ScamGuard scans them", () => {
  assert.equal(normalizeTelegramUrl("triproofprotocol.com"), "https://triproofprotocol.com")
  assert.equal(normalizeTelegramUrl("triproofprotocol.com/dashboard/airdrop"), "https://triproofprotocol.com/dashboard/airdrop")
})

test("strips invisible Telegram transport noise from URLs", () => {
  assert.equal(
    normalizeTelegramUrl("https://triproofprotocol.com/dashboard/airdrop\u2060\uFFFD"),
    "https://triproofprotocol.com/dashboard/airdrop"
  )
})

test("converts Telegram URL entities into normalized text links", () => {
  const update = normalizeTelegramUpdate({
    update_id: 1,
    message: {
      message_id: 9,
      text: "triproofprotocol.com",
      chat: { id: -100, type: "supergroup" },
      entities: [{ type: "url", offset: 0, length: 20 }],
    },
  })

  assert.deepEqual(update.message?.entities, [
    { type: "text_link", offset: 0, length: 20, url: "https://triproofprotocol.com" },
  ])
})

test("collapses a clean entity URL and Unicode-contaminated text URL into one scan candidate", () => {
  const cleanUrl = "https://triproofprotocol.com/dashboard/airdrop"
  const noisyUrl = `${cleanUrl}\u2060\uFFFD`
  const text = `Tri-Proof Points:\n${noisyUrl}`
  const offset = text.indexOf(noisyUrl)
  const normalized = normalizeTelegramUpdate({
    update_id: 99,
    message: {
      message_id: 199,
      text,
      chat: { id: -100, type: "supergroup" },
      entities: [{ type: "text_link", offset, length: noisyUrl.length, url: cleanUrl }],
    },
  })

  assert.equal(normalized.message?.text?.length, text.length)
  const urlCandidates = extractAdvancedScanCandidates(normalized.message!).filter((candidate) => candidate.source === "url")
  assert.equal(urlCandidates.length, 1)
  assert.equal(urlCandidates[0].value, cleanUrl)
})

test("masks educational secret-material warnings without hiding real requests", () => {
  const educational = "Tri-Proof will never ask for your private key. https://triproofprotocol.com"
  const masked = maskBenignSecretMaterialMentions(educational)
  assert.equal(/\bprivate key\b/i.test(masked), false)
  assert.equal(masked.length, educational.length)

  const malicious = "Send your private key to verify the wallet."
  assert.equal(maskBenignSecretMaterialMentions(malicious), malicious)
})

test("masks every secret term in a comma-separated protective list", () => {
  const educational = "Security reminder: Tri-Proof will never ask for your seed phrase, recovery phrase, or private key."
  const masked = maskBenignSecretMaterialMentions(educational)

  assert.equal(/\bseed phrase\b/i.test(masked), false)
  assert.equal(/\brecovery phrase\b/i.test(masked), false)
  assert.equal(/\bprivate key\b/i.test(masked), false)
  assert.equal(masked.length, educational.length)
})

test("does not let nearby safety copy hide a real secret-material request", () => {
  const mixed = "Never share your seed phrase with strangers, but enter your private key here to verify the wallet."
  const masked = maskBenignSecretMaterialMentions(mixed)

  assert.equal(/\bseed phrase\b/i.test(masked), false)
  assert.equal(/\bprivate key\b/i.test(masked), true)
})

test("normalizes the exact Tri-Proof group test message without creating a secret target", async () => {
  const actions = await handleTelegramUpdate({
    update_id: 44,
    message: {
      message_id: 244,
      text: [
        "🛡 Tri-Proof Security Test",
        "",
        "Tri-Proof Points:",
        "https://triproofprotocol.com/dashboard/airdrop",
        "",
        "Security reminder: Tri-Proof will never ask for your seed phrase, recovery phrase, or private key.",
      ].join("\n"),
      chat: { id: -144, type: "supergroup", title: "Tri-Proof Test" },
    },
  }, {
    groupSettings: {
      guardianEnabled: true,
      allowlisted: true,
      alertLevel: "HIGH_RISK",
      dailySummary: true,
      autoMuteCritical: false,
    },
  })

  assert.ok(actions.length >= 1)
  assert.ok(actions.every((action) => !/Secret material request/i.test(action.payload.text)))
})

test("masks Turkish safety wording around secret material", () => {
  const educational = "Asla seed phrase paylaşmayın; Tri-Proof bunu istemez."
  assert.equal(/\bseed phrase\b/i.test(maskBenignSecretMaterialMentions(educational)), false)
})

test("persistent rate limits also protect explicit group scan commands", async () => {
  let requestedGroupLimit = false
  const actions = await handleTelegramUpdate(
    {
      update_id: 2,
      message: {
        message_id: 10,
        text: "/scan https://example.com/claim",
        chat: { id: -100, type: "supergroup" },
        from: { id: 7, first_name: "Tester" },
      },
    },
    {
      consumePersistentAllowance: async (input) => {
        requestedGroupLimit = input.group
        return { allowed: false, retryAfterSeconds: 60 }
      },
    }
  )

  assert.equal(requestedGroupLimit, true)
  assert.equal(actions.length, 1)
  assert.match(actions[0].payload.text, /scan limit reached/i)
})
