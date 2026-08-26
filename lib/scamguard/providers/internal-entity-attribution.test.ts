import assert from "node:assert/strict"
import test from "node:test"

import {
  isActionableInfrastructureAttribution,
  isInfrastructureEntity,
  summarizeEntityAttribution,
} from "./internal-entity-attribution"

const d = (day: number) => new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`)

test("entity attribution keeps provenance only for the winning identity", () => {
  const result = summarizeEntityAttribution([
    { knownEntityLabel: "Example Exchange", knownEntityType: "exchange", provider: "provider-a", updatedAt: d(8) },
    { knownEntityLabel: "Example Exchange", knownEntityType: "exchange", provider: "provider-b", updatedAt: d(9) },
    { knownEntityLabel: "Unknown Service", knownEntityType: "service", provider: "provider-c", updatedAt: d(10) },
  ])

  assert.equal(result.label, "Example Exchange")
  assert.equal(result.entityType, "exchange")
  assert.equal(result.observations, 2)
  assert.deepEqual(result.providers.sort(), ["provider-a", "provider-b"])
  assert.equal(result.independentProviderCount, 2)
  assert.equal(result.attributionConfidence, "medium")
})

test("repeated observations from one provider cannot create actionable infrastructure attribution", () => {
  const result = summarizeEntityAttribution([
    { knownEntityLabel: "Example Bridge", knownEntityType: "bridge", provider: "provider-a", updatedAt: d(8) },
    { knownEntityLabel: "Example Bridge", knownEntityType: "bridge", provider: "provider-a", updatedAt: d(9) },
  ])

  assert.equal(result.observations, 2)
  assert.equal(result.independentProviderCount, 1)
  assert.equal(result.attributionConfidence, "low")
  assert.equal(isActionableInfrastructureAttribution(result), false)
})

test("two independent providers can make infrastructure attribution review-actionable but not safe", () => {
  const result = summarizeEntityAttribution([
    { knownEntityLabel: "Example Bridge", knownEntityType: "bridge", provider: "provider-a", updatedAt: d(8) },
    { knownEntityLabel: "Example Bridge", knownEntityType: "bridge", provider: "provider-b", updatedAt: d(9) },
  ])

  assert.equal(isActionableInfrastructureAttribution(result), true)
  assert.equal(isInfrastructureEntity(result.entityType), true)
})

test("empty or incomplete attribution stays neutral", () => {
  const result = summarizeEntityAttribution([
    { knownEntityLabel: null, knownEntityType: null, provider: "provider-a", updatedAt: d(10) },
  ])
  assert.equal(result.label, undefined)
  assert.equal(result.entityType, undefined)
  assert.equal(result.observations, 0)
  assert.equal(result.independentProviderCount, 0)
  assert.equal(result.attributionConfidence, "none")
})

test("known infrastructure types are context only and never imply safety", () => {
  assert.equal(isInfrastructureEntity("exchange"), true)
  assert.equal(isInfrastructureEntity("bridge"), true)
  assert.equal(isInfrastructureEntity("protocol"), true)
  assert.equal(isInfrastructureEntity("user"), false)
  assert.equal(isInfrastructureEntity(undefined), false)
})
