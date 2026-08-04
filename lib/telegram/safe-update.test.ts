import assert from "node:assert/strict"
import test from "node:test"

import {
  maskBenignSecretMaterialMentions,
  normalizeTelegramUpdate,
  normalizeTelegramUrl,
} from "@/lib/telegram/safe-update"

test("normalizes bare Telegram domains before ScamGuard scans them", () => {
  assert.equal(normalizeTelegramUrl("triproofprotocol.com"), "https://triproofprotocol.com")
  assert.equal(normalizeTelegramUrl("triproofprotocol.com/dashboard/airdrop"), "https://triproofprotocol.com/dashboard/airdrop")
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

test("masks educational secret-material warnings without hiding real requests", () => {
  const educational = "Tri-Proof will never ask for your private key. https://triproofprotocol.com"
  const masked = maskBenignSecretMaterialMentions(educational)
  assert.equal(/\bprivate key\b/i.test(masked), false)
  assert.equal(masked.length, educational.length)

  const malicious = "Send your private key to verify the wallet."
  assert.equal(maskBenignSecretMaterialMentions(malicious), malicious)
})

test("masks Turkish safety wording around secret material", () => {
  const educational = "Asla seed phrase paylaşmayın; Tri-Proof bunu istemez."
  assert.equal(/\bseed phrase\b/i.test(maskBenignSecretMaterialMentions(educational)), false)
})
