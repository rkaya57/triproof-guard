import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { decisionLabel } from "../decision-labels"
import {
  parseVisualDecisionProofRequest,
  visualDecisionProofLimits,
} from "./visual-decision-proof"

test("preserves legacy graph limit semantics", () => {
  const cases = [
    ["75", 75],
    ["1", visualDecisionProofLimits.min],
    ["999", visualDecisionProofLimits.max],
    ["25abc", 25],
    [null, visualDecisionProofLimits.default],
  ] as const

  cases.forEach(([limit, expected]) => {
    const params = new URLSearchParams()
    if (limit !== null) params.set("limit", limit)
    const parsed = parseVisualDecisionProofRequest(params)
    assert.equal(parsed.ok, true)
    if (parsed.ok) assert.equal(parsed.value.limit, expected)
  })
})

test("preserves legacy component trim-and-fallback input", () => {
  const parsed = parseVisualDecisionProofRequest(new URLSearchParams({ component: " legacy-component " }))
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.value.component, "legacy-component")
})

test("bounds new Visual Decision Proof cluster requests", () => {
  const parsed = parseVisualDecisionProofRequest(
    new URLSearchParams({ component: "GC-001", node: "address:Base:0xabc", cluster: "CL-001", limit: "999" })
  )

  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.value.limit, visualDecisionProofLimits.max)
  assert.equal(parsed.value.component, "GC-001")
  assert.equal(parsed.value.node, "address:Base:0xabc")
  assert.equal(parsed.value.cluster, "CL-001")
})

test("rejects malformed node and cluster identifiers", () => {
  const invalidNode = parseVisualDecisionProofRequest(new URLSearchParams({ node: "address:Base:<script>" }))
  const invalidCluster = parseVisualDecisionProofRequest(new URLSearchParams({ cluster: "CL-001%00" }))
  const oversizedNode = parseVisualDecisionProofRequest(new URLSearchParams({ node: "a".repeat(221) }))
  const oversizedCluster = parseVisualDecisionProofRequest(new URLSearchParams({ cluster: "a".repeat(121) }))

  assert.equal(invalidNode.ok, false)
  assert.equal(invalidCluster.ok, false)
  assert.equal(oversizedNode.ok, false)
  assert.equal(oversizedCluster.ok, false)
})

test("uses canonical decision labels without redefining stored statuses", () => {
  assert.equal(decisionLabel("approved"), "Approved")
  assert.equal(decisionLabel("manual_review"), "Gray Zone")
  assert.equal(decisionLabel("rejected"), "Rejected / Not Eligible")

  const source = readFileSync("components/analysis/wallet-graph-intelligence.tsx", "utf8")
  assert.match(source, /import \{ decisionLabel \} from "@\/lib\/decision-labels"/)
  assert.match(source, /decisionLabel\(visibleFocus\.decision\.status\)/)
})

test("reads graph deep-link focus after hydration without changing stored decision data", () => {
  const source = readFileSync("components/analysis/decision-evidence-view.tsx", "utf8")
  assert.match(source, /useSyncExternalStore\(subscribeToLocation, clientLocationSearch, serverLocationSearch\)/)
  assert.match(source, /graphFocusFromSearch\(locationSearch\)/)
})

test("uses the persisted cluster label relationship for member retrieval", () => {
  const route = readFileSync("app/api/analysis/[id]/graph/route.ts", "utf8")
  const serializer = readFileSync("lib/analysis/serializers.ts", "utf8")
  const writer = readFileSync("lib/analysis/batch-worker.ts", "utf8")

  assert.match(route, /where: \{ analysisId, clusterId: clusterLabel \}/)
  assert.match(serializer, /wallet\.clusterId === cluster\.clusterLabel/)
  assert.match(writer, /clusterId: wallet\.clusterId/)
  assert.match(writer, /clusterLabel: cluster\.clusterLabel/)
})

test("keeps the graph route scoped to the authenticated analysis owner", () => {
  const source = readFileSync("app/api/analysis/[id]/graph/route.ts", "utf8")

  assert.match(source, /if \(!user\).*Unauthorized/)
  assert.match(source, /project: \{ userId: user\.id \}/)
  assert.match(source, /analysisId: id/)
  assert.match(source, /Cache-Control.*private, no-store/)
})
