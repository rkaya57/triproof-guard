import assert from "node:assert/strict"
import test from "node:test"

import {
  AuthRequestError,
  assertTrustedAuthOrigin,
  passwordPolicyIssues,
} from "./security"

test("password policy rejects weak and common passwords", () => {
  assert.ok(passwordPolicyIssues("password123").length > 0)
  assert.ok(passwordPolicyIssues("abcdefghij").some((issue) => issue.includes("number")))
  assert.deepEqual(passwordPolicyIssues("Correct-Horse-2026"), [])
})

test("same-origin auth mutations are accepted", () => {
  const request = new Request("https://triproofprotocol.com/api/auth/login", {
    method: "POST",
    headers: { Origin: "https://triproofprotocol.com" },
  })
  assert.doesNotThrow(() => assertTrustedAuthOrigin(request))
})

test("cross-origin auth mutations are rejected", () => {
  const request = new Request("https://triproofprotocol.com/api/auth/login", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
  })
  assert.throws(
    () => assertTrustedAuthOrigin(request),
    (error) => error instanceof AuthRequestError && error.status === 403
  )
})
