import assert from "node:assert/strict"
import test from "node:test"

import { isLikelyUrl, isSubmissionLocked, isXUrl } from "./tasks"

test("task target URLs only accept http and https", () => {
  assert.equal(isLikelyUrl("https://x.com/TriProof_"), true)
  assert.equal(isLikelyUrl("javascript:alert(1)"), false)
  assert.equal(isLikelyUrl("not-a-url"), false)
})

test("X quote targets must use an X or Twitter hostname", () => {
  assert.equal(isXUrl("https://x.com/TriProof_/status/123"), true)
  assert.equal(isXUrl("https://twitter.com/TriProof_/status/123"), true)
  assert.equal(isXUrl("https://example.com/?next=x.com"), false)
})

test("pending and approved submissions cannot be submitted again", () => {
  assert.equal(isSubmissionLocked("PENDING"), true)
  assert.equal(isSubmissionLocked("APPROVED"), true)
  assert.equal(isSubmissionLocked("REJECTED"), false)
  assert.equal(isSubmissionLocked(null), false)
})
