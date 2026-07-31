import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createAnalysisBatchLeaseToken } from "@/lib/analysis/batch-lease"

describe("analysis batch lease tokens", () => {
  it("creates unique worker-scoped fencing tokens", () => {
    const first = createAnalysisBatchLeaseToken()
    const second = createAnalysisBatchLeaseToken()

    assert.match(first, /^Worker lease: .+:[0-9a-f-]{36}$/i)
    assert.match(second, /^Worker lease: .+:[0-9a-f-]{36}$/i)
    assert.notEqual(first, second)
  })
})
