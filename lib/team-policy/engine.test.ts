import assert from "node:assert/strict"
import test from "node:test"
import { TeamPolicyAction, TeamPolicyRuleType } from "@prisma/client"

import { evaluateTeamPolicies, type TeamPolicyWithRules } from "./engine"

function policy(rule: { type: TeamPolicyRuleType; value?: string | null; action?: TeamPolicyAction }): TeamPolicyWithRules {
  return {
    id: "policy-1", userId: "user-1", name: "Treasury protection", active: true, createdAt: new Date(), updatedAt: new Date(), violations: [],
    rules: [{ id: "rule-1", policyId: "policy-1", type: rule.type, value: rule.value ?? null, action: rule.action ?? TeamPolicyAction.BLOCK, active: true, createdAt: new Date(), updatedAt: new Date() }],
  }
}

const baseResult = { metadata: { chain: "evm", domain: "app.example.com", decodedIntent: { spender: "0x1111111111111111111111111111111111111111" } }, signals: [] } as never

test("team policy blocks a domain that is outside an allowlist", () => {
  const decision = evaluateTeamPolicies([policy({ type: TeamPolicyRuleType.DOMAIN_ALLOWLIST, value: "trusted.example" })], baseResult)
  assert.equal(decision.action, TeamPolicyAction.BLOCK)
  assert.match(decision.matched[0].reason, /outside the team allowlist/)
})

test("team policy matches an exact EVM spender regardless of casing", () => {
  const decision = evaluateTeamPolicies([policy({ type: TeamPolicyRuleType.EVM_SPENDER_BLOCK, value: "0X1111111111111111111111111111111111111111", action: TeamPolicyAction.REVIEW })], baseResult)
  assert.equal(decision.action, TeamPolicyAction.REVIEW)
})

test("team policy blocks unlimited approval without a static rule value", () => {
  const result = { ...baseResult, signals: [{ code: "UNLIMITED_EVM_APPROVAL" }] } as never
  const decision = evaluateTeamPolicies([policy({ type: TeamPolicyRuleType.UNLIMITED_APPROVAL_BLOCK })], result)
  assert.equal(decision.action, TeamPolicyAction.BLOCK)
})
