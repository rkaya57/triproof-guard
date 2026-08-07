import assert from "node:assert/strict"
import test from "node:test"

import { compareScamDna } from "./scam-dna"
import type { ScamDnaFingerprintData } from "./html-fingerprint"

const fingerprint: ScamDnaFingerprintData = {
  contentHash: "content-a",
  domHash: "dom-a",
  scriptHash: "script-a",
  textHash: "text-a",
  styleHash: "style-a",
  faviconUrlHash: "favicon-a",
  redirectHash: "redirect-a",
  behaviorHash: "behavior-a",
  fingerprintKey: "fingerprint-a",
  clusterKey: "cluster-a",
  behaviorFlags: ["wallet_signing_api", "obfuscated_script"],
  chainHints: ["evm"],
  walletTargets: ["0x1111111111111111111111111111111111111111"],
  programTargets: [],
  featureTokens: ["behavior:wallet_signing_api"],
  stats: { tagCount: 20, scriptCount: 2, formCount: 1, iframeCount: 0, externalScriptCount: 1 },
}

test("Scam DNA requires corroborated cross-domain evidence before it becomes actionable", () => {
  const match = compareScamDna(fingerprint, {
    domain: "clone.example",
    contentHash: "different-content",
    domHash: "dom-a",
    scriptHash: "script-a",
    textHash: "different-text",
    styleHash: "style-a",
    faviconUrlHash: "different-favicon",
    redirectHash: "different-redirect",
    behaviorHash: "behavior-a",
    behaviorFlags: ["wallet_signing_api", "obfuscated_script"],
    walletTargets: ["0x1111111111111111111111111111111111111111"],
    programTargets: [],
    riskLevel: "HIGH_RISK",
    campaign: { id: "campaign-1", verdict: "UNKNOWN", label: null },
  }, "fresh.example")

  assert.equal(match.matched, true)
  assert.equal(match.actionable, true)
  assert.equal(match.verdict, "suspicious")
  assert.ok(match.similarity >= 0.72)
  assert.ok(match.evidence.includes("shared wallet, contract, or program target"))
})

test("Scam DNA does not escalate a same-domain repeat or a generic one-part match", () => {
  const sameDomain = compareScamDna(fingerprint, {
    domain: "fresh.example",
    contentHash: "content-a",
    domHash: "dom-a",
    scriptHash: "script-a",
    textHash: "text-a",
    styleHash: "style-a",
    faviconUrlHash: "favicon-a",
    redirectHash: "redirect-a",
    behaviorHash: "behavior-a",
    behaviorFlags: fingerprint.behaviorFlags,
    walletTargets: fingerprint.walletTargets,
    programTargets: [],
    riskLevel: "CRITICAL",
    campaign: { id: "campaign-1", verdict: "KNOWN_BAD", label: "Reviewed kit" },
  }, "fresh.example")
  const generic = compareScamDna(fingerprint, {
    domain: "other.example",
    contentHash: "different",
    domHash: "dom-a",
    scriptHash: "different",
    textHash: "different",
    styleHash: "different",
    faviconUrlHash: "different",
    redirectHash: "different",
    behaviorHash: "different",
    behaviorFlags: [],
    walletTargets: [],
    programTargets: [],
    riskLevel: "CRITICAL",
    campaign: null,
  }, "fresh.example")

  assert.equal(sameDomain.actionable, false)
  assert.equal(generic.actionable, false)
})

test("unreviewed text-only secret wording cannot seed an actionable cross-domain clone", () => {
  const current: ScamDnaFingerprintData = {
    ...fingerprint,
    contentHash: "login-content",
    domHash: "login-dom",
    scriptHash: "login-script",
    textHash: "login-text",
    behaviorHash: "secret-text-behavior",
    behaviorFlags: ["secret_material_request"],
    walletTargets: [],
    featureTokens: ["behavior:secret_material_request"],
  }

  const match = compareScamDna(current, {
    domain: "trusted-login.example",
    contentHash: "login-content",
    domHash: "login-dom",
    scriptHash: "login-script",
    textHash: "login-text",
    styleHash: current.styleHash,
    faviconUrlHash: current.faviconUrlHash,
    redirectHash: current.redirectHash,
    behaviorHash: "secret-text-behavior",
    behaviorFlags: ["secret_material_request"],
    walletTargets: [],
    programTargets: [],
    riskLevel: "CRITICAL",
    campaign: { id: "campaign-stale", verdict: "UNKNOWN", label: null },
  }, "another-login.example")

  assert.equal(match.matched, true)
  assert.equal(match.actionable, false)
  assert.equal(match.verdict, "unknown")
  assert.ok(match.evidence.some((item) => item.includes("context-only")))
})

test("reviewed malicious campaigns remain actionable even without automated behavior flags", () => {
  const current: ScamDnaFingerprintData = {
    ...fingerprint,
    contentHash: "reviewed-content",
    domHash: "reviewed-dom",
    scriptHash: "reviewed-script",
    behaviorHash: "reviewed-behavior",
    behaviorFlags: ["secret_material_request"],
    walletTargets: [],
  }

  const match = compareScamDna(current, {
    domain: "reviewed-bad.example",
    contentHash: "reviewed-content",
    domHash: "reviewed-dom",
    scriptHash: "reviewed-script",
    textHash: current.textHash,
    styleHash: current.styleHash,
    faviconUrlHash: current.faviconUrlHash,
    redirectHash: current.redirectHash,
    behaviorHash: "reviewed-behavior",
    behaviorFlags: ["secret_material_request"],
    walletTargets: [],
    programTargets: [],
    riskLevel: "CRITICAL",
    campaign: { id: "campaign-reviewed", verdict: "KNOWN_BAD", label: "Reviewed phishing kit" },
  }, "clone.example")

  assert.equal(match.actionable, true)
  assert.equal(match.verdict, "known_bad")
})
