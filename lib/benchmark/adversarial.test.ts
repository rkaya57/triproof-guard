import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  adversarialScenarios,
  runAdversarialSuite,
} from "./adversarial-suite"

function failureSummary(report: ReturnType<typeof runAdversarialSuite>) {
  return report.results
    .filter((result) => !result.passed)
    .map((result) => `${result.id}: ${result.failures.join(" | ")}`)
    .join("\n")
}

describe("adversarial Sybil resilience suite", () => {
  it("covers the required attack and false-positive threat models", () => {
    const ids = new Set(adversarialScenarios().map((scenario) => scenario.id))

    ;[
      "tight-funding-behavior-cluster",
      "low-and-slow-shared-funder",
      "organic-camouflage-cluster",
      "referral-campaign-coordination",
      "circular-funding-ring",
      "self-referral-organic-camouflage",
      "bot-camouflage-high-history",
      "solana-camouflage-cluster",
      "hidden-small-cluster-in-organic-population",
      "known-exchange-fanout-negative-control",
      "shared-funder-only-negative-control",
      "provider-failure-negative-control",
      "trusted-policy-hard-signal-conflict",
    ].forEach((id) => assert.ok(ids.has(id), `Missing adversarial scenario ${id}`))
  })

  it("contains every adversarial wallet and protects organic controls", () => {
    const report = runAdversarialSuite()

    assert.equal(report.passed, true, failureSummary(report))
    assert.equal(
      report.maliciousAutoApprovals,
      0,
      `Auto-approved malicious wallets detected.\n${failureSummary(report)}`
    )
    assert.equal(report.attackContainmentRate, 1)
    assert.ok(report.organicControlFalseRejectRate <= 0.03)
    assert.equal(report.passedScenarios, report.totalScenarios)
  })

  it("keeps negative controls from becoming suspicious clusters", () => {
    const report = runAdversarialSuite()
    const exchangeControl = report.results.find(
      (result) => result.id === "known-exchange-fanout-negative-control"
    )
    const sharedFundingControl = report.results.find(
      (result) => result.id === "shared-funder-only-negative-control"
    )
    const providerControl = report.results.find(
      (result) => result.id === "provider-failure-negative-control"
    )

    assert.ok(exchangeControl)
    assert.ok(sharedFundingControl)
    assert.ok(providerControl)
    assert.equal(exchangeControl.clusters, 0)
    assert.equal(sharedFundingControl.clusters, 0)
    assert.equal(exchangeControl.organicFalseRejects, 0)
    assert.equal(sharedFundingControl.organicFalseRejects, 0)
    assert.equal(providerControl.organicFalseRejects, 0)
  })

  it("detects coordinated clusters across both EVM and Solana fixtures", () => {
    const report = runAdversarialSuite()
    const evm = report.results.find(
      (result) => result.id === "tight-funding-behavior-cluster"
    )
    const solana = report.results.find(
      (result) => result.id === "solana-camouflage-cluster"
    )

    assert.ok(evm)
    assert.ok(solana)
    assert.ok(evm.clusters >= 1)
    assert.ok(solana.clusters >= 1)
    assert.equal(
      evm.maliciousAutoApprovals,
      0,
      evm.failures.join(" | ")
    )
    assert.equal(
      solana.maliciousAutoApprovals,
      0,
      solana.failures.join(" | ")
    )
  })
})
