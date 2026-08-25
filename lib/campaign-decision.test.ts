import assert from "node:assert/strict"
import test from "node:test"

// Keep customer-facing execution and forensic-interpretation surfaces inside the decision-safety gate.
import "@/lib/campaign-decision-package/index.test"
import "@/lib/campaign-decision-package/export.test"
import "@/lib/cluster-investigation/archetypes.test"
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
