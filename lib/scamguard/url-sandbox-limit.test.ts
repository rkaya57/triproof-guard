import assert from "node:assert/strict"
import test from "node:test"

import { sandboxBlockedSignal } from "./url-sandbox"

test("oversized sandbox responses are incomplete scans, not threat findings", () => {
  const signal = sandboxBlockedSignal("Response exceeds the 1048576-byte sandbox limit.")

  assert.equal(signal.code, "SANDBOX_RESPONSE_TOO_LARGE")
  assert.equal(signal.severity, "low")
})

test("security sandbox blocks remain caution-level signals", () => {
  const signal = sandboxBlockedSignal("Local and internal hostnames are blocked.")

  assert.equal(signal.code, "SANDBOX_TARGET_BLOCKED")
  assert.equal(signal.severity, "medium")
})
