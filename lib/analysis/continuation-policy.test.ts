import assert from "node:assert/strict"
import test from "node:test"
import { continuationUrl, needsContinuation } from "./continuation-policy"

test("a multi-invocation queue continues until its remaining work is drained", () => {
  const snapshots = [5, 3, 1, 0].map((pending) => ({ pending, processing: 0 }))
  assert.deepEqual(snapshots.map((queue) => needsContinuation(queue)), [true, true, true, false])
})

test("live workers are not duplicated and expired processing can recover", () => {
  assert.equal(needsContinuation({ pending: 5, processing: 1, staleProcessing: 0 }), false)
  assert.equal(needsContinuation({ pending: 0, processing: 1, staleProcessing: 1 }), true)
  assert.equal(needsContinuation(null), false)
  assert.equal(needsContinuation(undefined), false)
})

test("global continuations request immediate acknowledgement without a validation bootstrap", () => {
  const url = continuationUrl("https://example.test", null)
  assert.equal(url.pathname, "/api/worker/analysis-queue")
  assert.equal(url.searchParams.get("defer"), "true")
  assert.equal(url.searchParams.has("analysisId"), false)
})

test("scoped continuations preserve the complete analysis identifier", () => {
  const id = "analysis/with ?&characters"
  const url = continuationUrl("https://example.test/base", id)
  assert.equal(url.origin, "https://example.test")
  assert.equal(url.searchParams.get("analysisId"), id)
  assert.equal(url.searchParams.get("defer"), "true")
})

test("a duplicate invocation that did not acquire the lock never spawns a successor", () => {
  assert.equal(needsContinuation({ pending: 5, processing: 0 }, false), false)
})
