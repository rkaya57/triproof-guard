import assert from "node:assert/strict"
import test from "node:test"

import { classifyHumanAdjudications } from "./internal-adjudication"

const at = (minute: number) => new Date(`2026-08-10T12:${String(minute).padStart(2, "0")}:00.000Z`)

test("two independent confirmed-risk reviewers produce confirmed risk", () => {
  const result = classifyHumanAdjudications([
    { label: "confirmed_risk", userId: "reviewer-a", createdAt: at(1) },
    { label: "confirmed_risk", userId: "reviewer-b", createdAt: at(2) },
  ])

  assert.equal(result.verdict, "confirmed_risk")
  assert.equal(result.confirmedRiskReviewers, 2)
  assert.equal(result.totalHumanReviewers, 2)
})

test("duplicate feedback from one reviewer cannot manufacture reviewer diversity", () => {
  const result = classifyHumanAdjudications([
    { label: "confirmed_risk", userId: "reviewer-a", createdAt: at(1) },
    { label: "confirmed_risk", userId: "reviewer-a", createdAt: at(2) },
  ])

  assert.equal(result.verdict, "insufficient")
  assert.equal(result.confirmedRiskReviewers, 1)
  assert.equal(result.totalHumanReviewers, 1)
})

test("trusted-user adjudications never become malicious evidence", () => {
  const result = classifyHumanAdjudications([
    { label: "trusted_user", userId: "reviewer-a", createdAt: at(1) },
    { label: "trusted_user", userId: "reviewer-b", createdAt: at(2) },
  ])

  assert.equal(result.verdict, "trusted")
  assert.equal(result.trustedReviewers, 2)
})

test("conflicting human adjudications are marked disputed", () => {
  const result = classifyHumanAdjudications([
    { label: "confirmed_risk", userId: "reviewer-a", createdAt: at(1) },
    { label: "trusted_user", userId: "reviewer-b", createdAt: at(2) },
  ])

  assert.equal(result.verdict, "disputed")
})

test("false negative feedback supports risk review but still requires reviewer diversity", () => {
  const result = classifyHumanAdjudications([
    { label: "false_negative", userId: "reviewer-a", createdAt: at(1) },
    { label: "confirmed_risk", userId: "reviewer-b", createdAt: at(2) },
  ])

  assert.equal(result.verdict, "confirmed_risk")
  assert.equal(result.falseNegativeReviewers, 1)
  assert.equal(result.confirmedRiskReviewers, 1)
})
