import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { hashHoldoutArtifactPayload } from "./holdout-artifacts"

test("holdout artifact hashing is deterministic and content-sensitive", () => {
  const payload = { runId: "hv-test", cases: 100, chains: ["Solana", "Ethereum"] }
  assert.equal(hashHoldoutArtifactPayload(payload), hashHoldoutArtifactPayload(payload))
  assert.notEqual(
    hashHoldoutArtifactPayload(payload),
    hashHoldoutArtifactPayload({ ...payload, cases: 101 })
  )
})

test("holdout reviewer bundle is post-freeze, engine-blind, and fixed-sampling", () => {
  const builder = readFileSync("lib/benchmark/holdout-reviewer-bundle.ts", "utf8")
  const route = readFileSync(
    "app/api/admin/benchmark/holdout/reviewer-bundle/route.ts",
    "utf8"
  )

  assert.match(builder, /createdAt:\s*\{ gte: cutoff \}/)
  assert.match(builder, /analysis:\s*\{[\s\S]*createdAt:\s*\{ gte: cutoff \}/)
  assert.match(builder, /buildBlindReviewerRow/)
  assert.match(builder, /reviewerCaseIds/)
  assert.match(builder, /auditRepresentativeIds/)
  assert.match(builder, /private_seal/)
  assert.match(route, /HOLDOUT_CASES_PER_PROJECT = 20/)
  assert.doesNotMatch(route, /searchParams|get\("perProject"\)/)
  assert.doesNotMatch(route, /auditCsv|privateSeal.*payload/i)
})

test("holdout artifact ledger is server-only and immutable by run/kind", () => {
  const migration = readFileSync(
    "prisma/migrations/20260809103000_holdout_validation_artifacts/migration.sql",
    "utf8"
  )
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "HoldoutValidationArtifact"/)
  assert.match(migration, /UNIQUE INDEX[\s\S]*\("runId", "kind"\)/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE "HoldoutValidationArtifact" FROM anon/)
  assert.match(migration, /REVOKE ALL ON TABLE "HoldoutValidationArtifact" FROM authenticated/)
})
