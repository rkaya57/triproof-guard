import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ENTITY_REGISTRY,
  ENTITY_REGISTRY_DATASET_VERSION,
  ENTITY_REGISTRY_SCHEMA_VERSION,
  detectKnownEntity,
  entityRegistrySummary,
  lookupEntityRegistry,
  validateEntityRegistry,
} from "@/lib/entity-registry"

describe("versioned entity registry", () => {
  it("passes integrity validation and keeps every migrated entity neutral", () => {
    const validation = validateEntityRegistry()
    assert.equal(validation.ok, true, validation.errors.join("\n"))
    assert.equal(validation.schemaVersion, ENTITY_REGISTRY_SCHEMA_VERSION)
    assert.equal(validation.datasetVersion, ENTITY_REGISTRY_DATASET_VERSION)
    assert.ok(validation.recordCount >= 30)

    for (const entity of ENTITY_REGISTRY) {
      assert.equal(entity.action, "manual_review")
      assert.equal(entity.riskEffect, "neutral_context")
      assert.equal(entity.sharedInfrastructureEffect, "neutral_context")
      assert.ok(entity.roles.length > 0)
      assert.ok(entity.provenance.reference.length > 0)
    }
  })

  it("looks up EVM infrastructure case-insensitively and returns registry provenance", () => {
    const entity = detectKnownEntity(
      "0xC22834581EBC8527D974F8A1C97E1BEA4EF910BC",
      "Ethereum"
    )
    assert.ok(entity)
    assert.equal(entity.id, "safe-proxy-factory-eip155")
    assert.equal(entity.type, "protocol")
    assert.ok(entity.roles.includes("smart_account_factory"))
    assert.equal(entity.registrySchemaVersion, ENTITY_REGISTRY_SCHEMA_VERSION)
    assert.equal(entity.registryDatasetVersion, ENTITY_REGISTRY_DATASET_VERSION)
    assert.equal(entity.riskEffect, "neutral_context")
  })

  it("keeps Solana addresses case-sensitive instead of manufacturing aliases", () => {
    const exact = lookupEntityRegistry(
      "cammczo5yl8w4vff8kvhrk22ggusp5vtaw7grrkgrwqk",
      "Solana"
    )
    const changedCase = lookupEntityRegistry(
      "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
      "Solana"
    )

    assert.ok(exact)
    assert.equal(exact.id, "raydium-clmm-program")
    assert.equal(changedCase, null)
  })

  it("does not apply a Solana-only record to a conflicting chain request", () => {
    const entity = lookupEntityRegistry(
      "11111111111111111111111111111111",
      "Ethereum"
    )
    assert.equal(entity, null)
  })

  it("preserves exchange and bridge eligibility context without turning it into malicious risk", () => {
    const exchange = detectKnownEntity(
      "0x28c6c06298d514db089934071355e5743bf21d60",
      "Ethereum"
    )
    const bridge = detectKnownEntity(
      "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1",
      "Ethereum"
    )

    assert.ok(exchange)
    assert.equal(exchange.type, "exchange")
    assert.ok(exchange.roles.includes("exchange_hot_wallet"))
    assert.equal(exchange.riskEffect, "neutral_context")

    assert.ok(bridge)
    assert.equal(bridge.type, "bridge")
    assert.ok(bridge.roles.includes("bridge_contract"))
    assert.equal(bridge.sharedInfrastructureEffect, "neutral_context")
  })

  it("exposes deterministic registry summary metadata", () => {
    const summary = entityRegistrySummary()
    assert.equal(summary.schemaVersion, ENTITY_REGISTRY_SCHEMA_VERSION)
    assert.equal(summary.datasetVersion, ENTITY_REGISTRY_DATASET_VERSION)
    assert.equal(summary.records, ENTITY_REGISTRY.length)
    assert.ok((summary.byRole.smart_account_factory ?? 0) >= 2)
    assert.ok((summary.byType.exchange ?? 0) >= 5)
  })

  it("rejects duplicate address scopes in registry validation", () => {
    const first = ENTITY_REGISTRY[0]
    assert.ok(first)
    const validation = validateEntityRegistry([
      first,
      { ...first, id: `${first.id}-duplicate` },
    ])
    assert.equal(validation.ok, false)
    assert.ok(validation.errors.some((error) => error.startsWith("duplicate address scope:")))
  })
})
