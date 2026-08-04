import assert from "node:assert/strict"
import test from "node:test"

import {
  airdropTaskSlugBase,
  airdropTaskSlugCandidate,
  isAirdropSchemaMissing,
  isLikelyUrl,
  isSubmissionLocked,
  isXUrl,
} from "./tasks"

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

test("same task title gets a different stable slug for each X post", () => {
  const title = "Quote and Share the Tri-Proof Protocol Post"
  const first = airdropTaskSlugBase(title, "https://x.com/TriProof_/status/2084342807397904802?s=20")
  const second = airdropTaskSlugBase(title, "https://x.com/TriProof_/status/2083643253555913179?s=20")

  assert.equal(first, "quote-and-share-the-tri-proof-protocol-post-2084342807397904802")
  assert.equal(second, "quote-and-share-the-tri-proof-protocol-post-2083643253555913179")
  assert.notEqual(first, second)
})

test("slug retries get deterministic numeric suffixes", () => {
  assert.equal(airdropTaskSlugCandidate("task", 0), "task")
  assert.equal(airdropTaskSlugCandidate("task", 1), "task-2")
  assert.equal(airdropTaskSlugCandidate("task", 2), "task-3")
})

test("unique constraint errors are not mislabeled as missing database tables", () => {
  const duplicate = Object.assign(new Error("Unique constraint failed on AirdropTask.slug"), { code: "P2002" })
  const missingTable = Object.assign(new Error("The table AirdropTask does not exist"), { code: "P2021" })

  assert.equal(isAirdropSchemaMissing(duplicate), false)
  assert.equal(isAirdropSchemaMissing(missingTable), true)
})

test("pending and approved submissions cannot be submitted again", () => {
  assert.equal(isSubmissionLocked("PENDING"), true)
  assert.equal(isSubmissionLocked("APPROVED"), true)
  assert.equal(isSubmissionLocked("REJECTED"), false)
  assert.equal(isSubmissionLocked(null), false)
})
