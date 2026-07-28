import assert from "node:assert/strict"
import { test } from "node:test"

import { detectScanCandidate, handleTelegramUpdate, type TelegramUpdate } from "./bot"

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
  assert.match(actions[0].payload.text, /ScamGuard Telegram beta/)
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
  assert.match(actions[0].payload.text, /ScamGuard grup uyar/)
})
