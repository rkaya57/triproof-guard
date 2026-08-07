import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migrationPath =
  "prisma/migrations/20260807204500_ai_evidence_audit/migration.sql"

const sql = readFileSync(migrationPath, "utf8")

test("AI audit ledger migration enables RLS and is not granted to public API roles", () => {
  assert.match(sql, /CREATE TABLE "AiEvidenceAudit"/)
  assert.match(sql, /ALTER TABLE "AiEvidenceAudit" ENABLE ROW LEVEL SECURITY;/)
  assert.match(
    sql,
    /REVOKE ALL ON TABLE "AiEvidenceAudit" FROM anon, authenticated;/
  )
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE).*anon/i)
  assert.doesNotMatch(
    sql,
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE).*authenticated/i
  )
})

test("AI audit ledger has idempotent event hash and bounded enum-like checks", () => {
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "AiEvidenceAudit_eventHash_key" ON "AiEvidenceAudit"\("eventHash"\)/
  )
  assert.match(sql, /AiEvidenceAudit_context_check/)
  assert.match(sql, /AiEvidenceAudit_subjectKind_check/)
  assert.match(sql, /AiEvidenceAudit_stage_check/)
  assert.match(sql, /AiEvidenceAudit_source_check/)
  assert.match(sql, /AiEvidenceAudit_recommendation_check/)
})
