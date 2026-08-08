import assert from "node:assert/strict"
import test from "node:test"

import {
  deterministicRelationshipInterpretation,
  graphComponentLabel,
  graphEvidenceConfidence,
  relationshipStrengths,
} from "@/lib/graph/investigation-presentation"
import type { WalletGraphComponent, WalletGraphEdge, WalletGraphNode } from "@/types"

const component: WalletGraphComponent = {
  componentId: "GC-002",
  nodeKeys: ["funder", "wallet-a", "wallet-b", "wallet-c", "wallet-d"],
  walletAddresses: ["a", "b", "c", "d"],
  edgeCount: 4,
  riskScore: 35,
  severity: "caution",
  dominantFunder: "opaque-funder",
  dominantReferrer: null,
  reasons: ["Shared funding context"],
}

const nodes: WalletGraphNode[] = [
  {
    nodeKey: "funder",
    address: null,
    chain: "Solana",
    kind: "funder",
    label: "Unknown funder",
    walletAddress: null,
    componentId: "GC-002",
    metadata: {},
  },
  ...["a", "b", "c", "d"].map((wallet) => ({
    nodeKey: `wallet-${wallet}`,
    address: null,
    chain: "Solana",
    kind: "wallet" as const,
    label: wallet,
    walletAddress: wallet,
    componentId: "GC-002",
    metadata: {},
  })),
]

const edges: WalletGraphEdge[] = ["a", "b", "c", "d"].map((wallet, index) => ({
  edgeKey: `edge-${wallet}`,
  sourceKey: "funder",
  targetKey: `wallet-${wallet}`,
  kind: "funded" as const,
  confidence: 88 - index,
  isRiskBearing: true,
  componentId: "GC-002",
  observedAt: null,
  transactionId: null,
  amount: null,
  evidence: ["First-observed funding relationship"],
  metadata: {},
}))

test("labels funding components for investigation rather than exposing opaque ids as the primary label", () => {
  assert.equal(graphComponentLabel(component), "Funding cluster · 4")
})

test("derives evidence confidence from observed edge confidence", () => {
  assert.equal(graphEvidenceConfidence(edges), "high")
})

test("detects shared-funder fanout and risk-relevant evidence without claiming ownership", () => {
  const strengths = relationshipStrengths(nodes, edges)
  assert.equal(strengths.funding, "high")
  assert.equal(strengths.maxFundingFanout, 4)
  assert.equal(strengths.riskRelevantCount, 4)

  const interpretation = deterministicRelationshipInterpretation(component, nodes, edges)
  assert.match(interpretation, /4 wallets share a first-observed funding origin/i)
  assert.match(interpretation, /does not prove shared ownership/i)
})
