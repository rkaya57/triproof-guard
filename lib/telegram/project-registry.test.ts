import assert from "node:assert/strict"
import test from "node:test"

import {
  assessProjectImpersonation,
  levenshteinDistance,
  normalizeBrandText,
  normalizeProjectAsset,
  type TelegramProjectRegistryEntry,
} from "@/lib/telegram/project-registry"

const registry: TelegramProjectRegistryEntry[] = [
  {
    id: "project-triproof",
    slug: "tri-proof-protocol",
    name: "Tri-Proof Protocol",
    normalizedName: "triproofprotocol",
    notes: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    assets: [
      {
        id: "domain",
        projectId: "project-triproof",
        kind: "DOMAIN",
        value: "triproofprotocol.com",
        normalized: "triproofprotocol.com",
        chain: "",
        active: true,
      },
      {
        id: "x",
        projectId: "project-triproof",
        kind: "X_HANDLE",
        value: "TriProof_",
        normalized: "triproof_",
        chain: "",
        active: true,
      },
      {
        id: "alias",
        projectId: "project-triproof",
        kind: "BRAND_ALIAS",
        value: "Tri-Proof Protocol",
        normalized: "triproofprotocol",
        chain: "",
        active: true,
      },
    ],
  },
]

test("official domains and subdomains match the verified registry", () => {
  const direct = assessProjectImpersonation(registry, { type: "url", value: "https://triproofprotocol.com", chain: "unknown" })
  const subdomain = assessProjectImpersonation(registry, { type: "url", value: "https://docs.triproofprotocol.com", chain: "unknown" })
  assert.equal(direct?.verified, true)
  assert.equal(subdomain?.verified, true)
})

test("lookalike domains are flagged as project impersonation", () => {
  const result = assessProjectImpersonation(
    registry,
    { type: "url", value: "https://triproofprotoco1.com/claim", chain: "unknown" },
    "Tri-Proof Protocol airdrop"
  )
  assert.equal(result?.suspicious, true)
  assert.equal(result?.projectName, "Tri-Proof Protocol")
})

test("official and lookalike X handles are distinguished", () => {
  const official = assessProjectImpersonation(registry, { type: "url", value: "https://x.com/TriProof_", chain: "unknown" })
  const fake = assessProjectImpersonation(registry, { type: "url", value: "https://x.com/TriPro0f_", chain: "unknown" })
  assert.equal(official?.verified, true)
  assert.equal(fake?.suspicious, true)
})

test("normalization handles domains, handles, and confusable brand characters", () => {
  assert.equal(normalizeProjectAsset("DOMAIN", "https://WWW.TriProofProtocol.com/path"), "triproofprotocol.com")
  assert.equal(normalizeProjectAsset("X_HANDLE", "https://x.com/TriProof_"), "triproof_")
  assert.equal(normalizeBrandText("Trі-Prооf Protocol"), "triproofprotocol")
  assert.equal(levenshteinDistance("triproof", "tripro0f"), 1)
})
