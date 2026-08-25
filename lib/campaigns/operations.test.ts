import assert from "node:assert/strict"
import test from "node:test"

import {
  campaignOperationBoundaries,
  normalizeCampaignLifecycleChange,
  normalizeCampaignPolicyChange,
  replaceRiskPolicyMarker,
} from "@/lib/campaigns/operations"

test("policy activation requires a real version change and an auditable rationale", () => {
  const noChange = normalizeCampaignPolicyChange(
    { preset: "balanced", rationale: "Keep the same policy." },
    { preset: "balanced", lifecycle: "active" },
  )
  assert.equal(noChange.code, "POLICY_NO_CHANGE")

  const noRationale = normalizeCampaignPolicyChange(
    { preset: "strict", rationale: "short" },
    { preset: "balanced", lifecycle: "active" },
  )
  assert.equal(noRationale.code, "INVALID_POLICY_RATIONALE")

  const changed = normalizeCampaignPolicyChange(
    { preset: "strict", rationale: "Increase protection before the final reward distribution." },
    { preset: "balanced", lifecycle: "active" },
  )
  assert.equal(changed.error, null)
  assert.equal(changed.value?.preset, "strict")
})

test("closed campaigns cannot receive a new policy version", () => {
  const completed = normalizeCampaignPolicyChange(
    { preset: "strict", rationale: "This should not activate after completion." },
    { preset: "balanced", lifecycle: "completed" },
  )
  assert.equal(completed.code, "CAMPAIGN_CLOSED")

  const archived = normalizeCampaignPolicyChange(
    { preset: "conservative", rationale: "This archived campaign must stay immutable." },
    { preset: "balanced", lifecycle: "archived" },
  )
  assert.equal(archived.code, "CAMPAIGN_CLOSED")
})

test("lifecycle transitions are forward-safe and archived campaigns cannot reopen", () => {
  assert.equal(
    normalizeCampaignLifecycleChange({ lifecycle: "paused" }, "active").error,
    null,
  )
  assert.equal(
    normalizeCampaignLifecycleChange({ lifecycle: "active" }, "paused").error,
    null,
  )
  assert.equal(
    normalizeCampaignLifecycleChange({ lifecycle: "active" }, "completed").code,
    "INVALID_LIFECYCLE_TRANSITION",
  )
  assert.equal(
    normalizeCampaignLifecycleChange({ lifecycle: "active" }, "archived").code,
    "INVALID_LIFECYCLE_TRANSITION",
  )
  assert.equal(
    normalizeCampaignLifecycleChange({ lifecycle: "archived" }, "completed").error,
    null,
  )
})

test("draft campaigns can activate or archive but cannot jump to completed", () => {
  assert.equal(normalizeCampaignLifecycleChange({ lifecycle: "active" }, "draft").error, null)
  assert.equal(normalizeCampaignLifecycleChange({ lifecycle: "archived" }, "draft").error, null)
  assert.equal(
    normalizeCampaignLifecycleChange({ lifecycle: "completed" }, "draft").code,
    "INVALID_LIFECYCLE_TRANSITION",
  )
})

test("risk policy marker replacement preserves non-policy notes and keeps one canonical marker", () => {
  const notes = replaceRiskPolicyMarker(
    "Pilot cohort\nTRIPROOF_RISK_POLICY=balanced\nTRIPROOF_CAMPAIGN_CONTRACTS=0xabc",
    "strict",
  )
  assert.match(notes, /Pilot cohort/)
  assert.match(notes, /TRIPROOF_CAMPAIGN_CONTRACTS=0xabc/)
  assert.equal((notes.match(/TRIPROOF_RISK_POLICY=/g) ?? []).length, 1)
  assert.match(notes, /TRIPROOF_RISK_POLICY=strict/)
})

test("operation boundaries keep policy changes future-facing and non-recomputing", () => {
  const boundaries = campaignOperationBoundaries().join(" ")
  assert.match(boundaries, /future analysis runs only/i)
  assert.match(boundaries, /never recomputes stored wallet decisions/i)
  assert.match(boundaries, /cannot be reopened/i)
})
