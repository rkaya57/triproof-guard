import assert from "node:assert/strict"
import test from "node:test"

import { summarizeReviewedCommunityThreats } from "./reviewed-community-threat-context"

const d = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`)

test("only moderator-reviewed published reports contribute context", () => {
  const result = summarizeReviewedCommunityThreats([
    { category: "phishing", promotedIntelEntryId: "intel-1", publishedAt: d(9), reviewerId: "admin-a" },
    { category: "impersonation", promotedIntelEntryId: null, publishedAt: d(10), reviewerId: "admin-b" },
    { category: "wallet_drainer", promotedIntelEntryId: null, publishedAt: d(10), reviewerId: null },
  ])

  assert.equal(result.publishedReports, 2)
  assert.equal(result.promotedReports, 1)
  assert.deepEqual(result.categories.sort(), ["impersonation", "phishing"])
  assert.equal(result.latestPublishedAt, "2026-08-10T12:00:00.000Z")
})

test("promoted reports remain identifiable so V2 can avoid double counting V1 intelligence", () => {
  const result = summarizeReviewedCommunityThreats([
    { category: "malicious_contract", promotedIntelEntryId: "intel-123", publishedAt: d(10), reviewerId: "admin-a" },
  ])

  assert.equal(result.publishedReports, 1)
  assert.equal(result.promotedReports, 1)
})
