import assert from "node:assert/strict"
import test from "node:test"

import {
  communityThreatReportSchema,
  isValidCommunityThreatTarget,
  normalizeCommunityThreatTarget,
} from "@/lib/scamguard/community-reports"

test("community threat reports normalize domains before duplicate and review checks", () => {
  assert.equal(normalizeCommunityThreatTarget("DOMAIN", "https://WWW.Example-Scam.xyz/claim?campaign=1"), "example-scam.xyz")
  assert.equal(normalizeCommunityThreatTarget("EVM_ADDRESS", "0xABcDEF0123456789aBcDeF0123456789AbCdEf01"), "0xabcdef0123456789abcdef0123456789abcdef01")
})

test("community threat reports only accept targets matching the selected type", () => {
  assert.equal(isValidCommunityThreatTarget("DOMAIN", "https://fake-claim.example.xyz/rewards"), true)
  assert.equal(isValidCommunityThreatTarget("EVM_ADDRESS", "0xabcdef0123456789abcdef0123456789abcdef01"), true)
  assert.equal(isValidCommunityThreatTarget("SOLANA_ADDRESS", "4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR"), true)
  assert.equal(isValidCommunityThreatTarget("DOMAIN", "not a domain"), false)
  assert.equal(isValidCommunityThreatTarget("EVM_ADDRESS", "4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR"), false)
})

test("community threat reports require a concrete description and bounded evidence", () => {
  const valid = communityThreatReportSchema.safeParse({
    projectName: "Fake Example",
    target: "fake-claim.example.xyz",
    targetKind: "DOMAIN",
    chain: "solana",
    category: "fake_airdrop",
    description: "The site impersonates a project and requests an unexpected wallet signature before showing any claim details.",
    evidenceUrl: "https://example.org/public-evidence",
    evidenceNote: "Observed through a public campaign post.",
  })
  assert.equal(valid.success, true)

  const unsupportedProtocol = communityThreatReportSchema.safeParse({
    projectName: "Fake Example",
    target: "fake-claim.example.xyz",
    targetKind: "DOMAIN",
    category: "phishing",
    description: "The site impersonates a project and requests an unexpected wallet signature before showing any claim details.",
    evidenceUrl: "javascript:alert('unsafe')",
  })
  assert.equal(unsupportedProtocol.success, false)

  const missingEvidence = communityThreatReportSchema.safeParse({
    projectName: "Fake Example",
    target: "fake-claim.example.xyz",
    targetKind: "DOMAIN",
    category: "phishing",
    description: "too short",
  })
  assert.equal(missingEvidence.success, false)
})
