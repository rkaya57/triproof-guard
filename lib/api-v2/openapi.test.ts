import assert from "node:assert/strict"
import test from "node:test"

import { campaignApiV2OpenApiWithCaseExport as campaignApiV2OpenApi } from "@/lib/api-v2/openapi-cluster-case-export"

const expectedOperations = [
  ["/api/v2/campaigns", "get"],
  ["/api/v2/campaigns", "post"],
  ["/api/v2/campaigns/{id}", "get"],
  ["/api/v2/campaigns/{id}", "patch"],
  ["/api/v2/campaigns/{id}/analyses", "post"],
  ["/api/v2/campaigns/{id}/analyses/{analysisId}", "get"],
  ["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters", "get"],
  ["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}", "get"],
  ["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/evidence", "get"],
  ["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/export", "get"],
  ["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/members", "get"],
  ["/api/v2/campaigns/{id}/decisions", "get"],
  ["/api/v2/campaigns/{id}/policy", "post"],
  ["/api/v2/webhooks", "get"],
  ["/api/v2/webhooks", "post"],
  ["/api/v2/webhooks/{id}", "get"],
  ["/api/v2/webhooks/{id}", "patch"],
  ["/api/v2/webhooks/{id}", "delete"],
  ["/api/v2/webhooks/{id}/deliveries", "get"],
  ["/api/v2/webhooks/{id}/deliveries/{deliveryId}/retry", "post"],
] as const

test("OpenAPI contract is versioned, production-scoped, and Bearer authenticated", () => {
  assert.equal(campaignApiV2OpenApi.openapi, "3.1.0")
  assert.equal(campaignApiV2OpenApi.info.version, "2.1.0")
  assert.deepEqual(campaignApiV2OpenApi.servers, [{ url: "https://triproofprotocol.com" }])
  assert.deepEqual(campaignApiV2OpenApi.security, [{ bearerAuth: [] }])
  assert.equal(campaignApiV2OpenApi.components.securitySchemes.bearerAuth.scheme, "bearer")
})

test("OpenAPI contract covers every published Campaign API v2 operation", () => {
  const paths = campaignApiV2OpenApi.paths as Record<string, Record<string, unknown>>
  for (const [path, method] of expectedOperations) {
    assert.ok(paths[path], `missing OpenAPI path ${path}`)
    assert.ok(paths[path]?.[method], `missing OpenAPI operation ${method.toUpperCase()} ${path}`)
  }
})

test("all OpenAPI operationIds are unique and stable enough for client generation", () => {
  const ids: string[] = []
  for (const pathItem of Object.values(campaignApiV2OpenApi.paths) as Array<Record<string, unknown>>) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== "object" || !("operationId" in operation)) continue
      ids.push(String((operation as { operationId: unknown }).operationId))
    }
  }
  assert.equal(ids.length, expectedOperations.length)
  assert.equal(new Set(ids).size, ids.length)
})

test("cluster API contract exposes GET-only forensic resources with explicit non-recomputation boundaries", () => {
  const paths = campaignApiV2OpenApi.paths as Record<string, Record<string, unknown>>
  const clusterPaths = Object.entries(paths).filter(([path]) => path.includes("/clusters"))
  assert.ok(clusterPaths.length >= 5)
  for (const [path, item] of clusterPaths) {
    assert.ok(item.get, `${path} must expose GET`)
    assert.equal(item.post, undefined, `${path} must not expose POST`)
    assert.equal(item.patch, undefined, `${path} must not expose PATCH`)
    assert.equal(item.delete, undefined, `${path} must not expose DELETE`)
    assert.equal((item.get as Record<string, unknown>)["x-triproof-read-only"], true)
  }

  const intelligence = paths["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}"]?.get as Record<string, unknown>
  assert.equal(intelligence["x-triproof-recomputes-membership"], false)
  assert.equal(intelligence["x-triproof-recomputes-decisions"], false)
})

test("evidence OpenAPI contract freezes lane, scan, cursor, and no-rescore semantics", () => {
  const operation = campaignApiV2OpenApi.paths["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/evidence"].get
  assert.equal(operation["x-triproof-read-only"], true)
  assert.equal(operation["x-triproof-rescores-evidence"], false)
  assert.equal(operation["x-triproof-max-source-scan-rows"], 10000)

  const parameters = operation.parameters as Array<{ name: string; schema?: Record<string, unknown> }>
  const lane = parameters.find((parameter) => parameter.name === "lane")
  const limit = parameters.find((parameter) => parameter.name === "limit")
  const cursor = parameters.find((parameter) => parameter.name === "cursor")
  assert.deepEqual(lane?.schema?.enum, ["funding", "graph"])
  assert.equal(limit?.schema?.maximum, 200)
  assert.match(String(cursor?.description), /opaque/i)
})

test("cluster case export OpenAPI contract freezes formats and no-recompute semantics", () => {
  const operation = campaignApiV2OpenApi.paths["/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/export"].get
  assert.equal(operation["x-triproof-read-only"], true)
  assert.equal(operation["x-triproof-recomputes-membership"], false)
  assert.equal(operation["x-triproof-recomputes-decisions"], false)
  assert.equal(operation["x-triproof-rescores-evidence"], false)
  assert.equal(operation["x-triproof-export-boundary"], "read-only-no-recompute")

  const parameters = operation.parameters as Array<{ name: string; schema?: Record<string, unknown> }>
  const format = parameters.find((parameter) => parameter.name === "format")
  assert.deepEqual(format?.schema?.enum, ["json", "csv", "markdown"])
  assert.ok(operation.responses["200"].content["text/markdown"])
})

test("machine-readable Tri-Proof decision boundaries reject misleading integration assumptions", () => {
  const boundaries = campaignApiV2OpenApi["x-triproof-decision-boundaries"]
  assert.equal(boundaries.clusterResourcesAreReadOnly, true)
  assert.equal(boundaries.clusterSupportConfidenceIsProbability, false)
  assert.equal(boundaries.inferredArchetypesAreAutomaticDecisions, false)
  assert.equal(boundaries.sharedInfrastructureIsStandaloneSybilEvidence, false)
  assert.equal(boundaries.unknownSharedFundingAloneIsConclusive, false)
  assert.equal(boundaries.policyChangesRecomputePriorRuns, false)
  assert.equal(boundaries.decisionPackageRecomputesStoredDecisions, false)
  assert.equal(boundaries.evidencePaginationRescoresEvidence, false)
})
