import assert from "node:assert/strict"
import test from "node:test"

import { normalizeReasonCode } from "@/lib/campaign-decision"

test("reason codes distinguish account state from non-user account evidence", () => {
  assert.equal(
    normalizeReasonCode("Solana account intelligence: system_user_wallet"),
    "ACCOUNT_STATE"
  )
  assert.equal(
    normalizeReasonCode("On-chain evidence: low program interaction diversity"),
    "LOW_DIVERSITY"
  )
  assert.equal(
    normalizeReasonCode("V1.5 eligibility: not a normal end-user wallet"),
    "NON_USER_ACCOUNT"
  )
})
