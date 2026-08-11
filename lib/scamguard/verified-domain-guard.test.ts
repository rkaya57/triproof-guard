import test from "node:test"
import assert from "node:assert/strict"

import { scanScamGuard, type ScamGuardScanResult } from "./engine"
import { applyVerifiedDomainFalsePositiveGuard, isCurrentVerifiedWeb3Domain } from "./verified-domain-guard"

test("current Phantom domain suppresses historical registry-gap heuristics", async () => {
  const value = "https://phantom.com/"
  const base = await scanScamGuard({ type: "url", value, chain: "solana" })

  assert.ok(base.signals.some((signal) => signal.code === "BRAND_IMPERSONATION" || signal.code === "TYPOSQUATTING_PATTERN"))

  const guarded = applyVerifiedDomainFalsePositiveGuard(value, base)
  assert.equal(guarded.riskLevel, "SAFE")
  assert.ok(guarded.score <= 22)
  assert.equal(guarded.metadata.reputation?.verdict, "trusted")
  assert.equal(guarded.metadata.reputation?.source, "verified-current-domain-registry")
  assert.ok(guarded.signals.some((signal) => signal.code === "CURRENT_VERIFIED_PROJECT_DOMAIN"))
  assert.ok(!guarded.signals.some((signal) => signal.code === "BRAND_IMPERSONATION" || signal.code === "TYPOSQUATTING_PATTERN"))
})

test("verified registry supports official subdomains without accepting lookalikes", () => {
  assert.equal(isCurrentVerifiedWeb3Domain("https://help.phantom.com/article"), true)
  assert.equal(isCurrentVerifiedWeb3Domain("https://web.uniswap.org/"), true)
  assert.equal(isCurrentVerifiedWeb3Domain("https://app.raydium.io/"), true)
  assert.equal(isCurrentVerifiedWeb3Domain("https://metamask.io/"), true)
  assert.equal(isCurrentVerifiedWeb3Domain("https://phantom.com.evil.example/"), false)
  assert.equal(isCurrentVerifiedWeb3Domain("https://phantom-wallet.com/"), false)
})

test("verified-domain trust never overrides independent known-bad evidence", () => {
  const result: ScamGuardScanResult = {
    id: "guard-known-bad",
    type: "url",
    score: 100,
    riskLevel: "CRITICAL",
    summary: "stop",
    confidence: "HIGH",
    explanation: "stop",
    signals: [{
      code: "EXTERNAL_THREAT_FEED_DOMAIN",
      severity: "critical",
      title: "Threat feed match",
      detail: "Independent threat intelligence matched this host.",
    }],
    actions: ["stop"],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      domain: "phantom.com",
      reputation: { verdict: "known_bad", source: "external_threat_feed", notes: ["matched"] },
    },
    scannedAt: new Date(0).toISOString(),
  }

  const guarded = applyVerifiedDomainFalsePositiveGuard("https://phantom.com/", result)
  assert.equal(guarded.riskLevel, "CRITICAL")
  assert.equal(guarded.score, 100)
  assert.equal(guarded.metadata.reputation?.verdict, "known_bad")
})

test("verified-domain trust never overrides seed phrase or browser credential signals", () => {
  const result: ScamGuardScanResult = {
    id: "guard-secret",
    type: "url",
    score: 100,
    riskLevel: "CRITICAL",
    summary: "stop",
    confidence: "HIGH",
    explanation: "stop",
    signals: [{
      code: "SECRET_MATERIAL_REQUEST",
      severity: "critical",
      title: "Seed phrase request",
      detail: "Secret material requested.",
    }],
    actions: ["stop"],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      domain: "phantom.com",
      reputation: { verdict: "unknown", source: "local", notes: [] },
    },
    scannedAt: new Date(0).toISOString(),
  }

  const guarded = applyVerifiedDomainFalsePositiveGuard("https://phantom.com/", result)
  assert.equal(guarded.riskLevel, "CRITICAL")
  assert.equal(guarded.score, 100)
  assert.ok(guarded.signals.some((signal) => signal.code === "SECRET_MATERIAL_REQUEST"))
})
