import assert from "node:assert/strict"
import test from "node:test"

import type { TelegramMessage } from "@/lib/telegram/bot"
import {
  extractAdvancedScanCandidates,
  resolveModerationAction,
} from "@/lib/telegram/guardian-v2"

function message(text: string): TelegramMessage {
  return {
    message_id: 1,
    text,
    chat: { id: -100123, type: "supergroup", title: "Test group" },
    from: { id: 7, first_name: "Test" },
  }
}

test("group scanner extracts URLs, wallet addresses, token addresses, and transaction intent", () => {
  const evm = "0x1111111111111111111111111111111111111111"
  const solana = "7YttLkHDoV6j1X4nF4CD7L7QJZB5KcT7qXxR6YyV8ZzA"
  const candidates = extractAdvancedScanCandidates(
    message(`Claim: https://example.com/claim\nToken CA: ${evm}\nWallet: ${solana}\nMethod: setApprovalForAll`)
  )

  assert.equal(candidates.some((candidate) => candidate.type === "url" && candidate.value.includes("example.com")), true)
  assert.equal(candidates.some((candidate) => candidate.type === "token" && candidate.value === evm), true)
  assert.equal(candidates.some((candidate) => candidate.type === "wallet" && candidate.value === solana), true)
  assert.equal(candidates.some((candidate) => candidate.type === "transaction" && candidate.chain === "evm"), true)
})

test("duplicate targets are collapsed into one candidate", () => {
  const evm = "0x2222222222222222222222222222222222222222"
  const candidates = extractAdvancedScanCandidates(message(`${evm}\n${evm}`))
  assert.equal(candidates.filter((candidate) => candidate.value === evm).length, 1)
})

test("critical and policy-blocked results select the configured quarantine policy", () => {
  const settings = {
    highRiskAction: "ADMIN_REVIEW" as const,
    criticalAction: "DELETE_MUTE_24H" as const,
    autoMuteCritical: false,
  }
  assert.equal(resolveModerationAction({ level: "HIGH_RISK", policyBlocked: false, settings }), "ADMIN_REVIEW")
  assert.equal(resolveModerationAction({ level: "CRITICAL", policyBlocked: false, settings }), "DELETE_MUTE_24H")
  assert.equal(resolveModerationAction({ level: "SAFE", policyBlocked: true, settings }), "DELETE_MUTE_24H")
})

test("legacy auto-mute setting upgrades critical admin review to one-hour quarantine", () => {
  const action = resolveModerationAction({
    level: "CRITICAL",
    policyBlocked: false,
    settings: {
      highRiskAction: "WARN_ONLY",
      criticalAction: "ADMIN_REVIEW",
      autoMuteCritical: true,
    },
  })
  assert.equal(action, "DELETE_MUTE_1H")
})
