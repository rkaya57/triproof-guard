# Tri-Proof Versioned Entity Registry

## Purpose

The Entity Registry is the canonical, reviewable source for known public Web3 infrastructure used by Tri-Proof analysis and graph intelligence. It separates **what an address is** from **whether a participant is malicious**.

Registry classifications are context and eligibility evidence only. A known exchange, bridge, protocol, router, relayer, paymaster, Safe factory, program, or token mint must never become standalone Sybil or malicious-risk evidence.

## Version contract

- Schema: `entity-registry-v1`
- Dataset: versioned independently from the risk engine.
- Every dataset change requires an explicit dataset-version bump.
- Engine/ruleset versions and registry versions must remain separately auditable.

The registry lives in `lib/entity-registry/index.ts`. The old `lib/risk-engine/known-entities.ts` path remains a compatibility facade so existing callers do not silently fork entity semantics.

## Record model

Each record carries:

- stable registry ID
- address
- network and optional chain scope
- human-readable label
- broad `EntityType`
- one or more operational roles
- lifecycle state (`active` or `deprecated`)
- eligibility action
- malicious-risk effect
- shared-infrastructure effect
- dataset version introduced
- provenance kind and reference

Supported operational roles include exchange hot wallets, service wallets, bridge contracts, protocol contracts/programs, system programs, token mints, smart-account factories, routers, relayers, paymasters, and proxy implementations.

## Safety invariants

1. Registry membership cannot create malicious risk by itself.
2. Reuse of known infrastructure cannot create Sybil evidence by itself.
3. Exchange/service/bridge/protocol infrastructure remains eligibility context and may be excluded from ordinary end-user reward lists without being called malicious.
4. Chain/network scope must be honored when supplied.
5. EVM addresses are normalized case-insensitively; Solana addresses remain case-sensitive.
6. Known-bad threat intelligence must not be mixed into this neutral infrastructure registry. Confirmed malicious addresses belong in a separately governed threat-intelligence source.
7. Deprecated records remain auditable but are not returned by active lookup.

## Provenance policy

Registry v1 migrates the previously curated `known-entities.ts` dataset without inventing new external claims. Those records are marked `legacy_curated` with a migration reference.

Before a new production record is added, it should have a traceable source such as protocol documentation, a public reference, or provider-verified metadata. The record must receive a stable ID and an appropriate role; the dataset version must be bumped in the same change.

## Review workflow

For every registry update:

1. Verify the address and network/chain scope.
2. Confirm the entity label and operational role from a traceable source.
3. Decide whether the address is infrastructure/eligibility context or belongs in threat intelligence instead.
4. Add or deprecate the record; do not silently overwrite historical identity.
5. Bump `ENTITY_REGISTRY_DATASET_VERSION`.
6. Run the registry integrity and risk-engine regression suites.
7. Confirm exchange/bridge/factory/router reuse remains non-risk-bearing in graph and decision evidence.
8. Release through preview before production.

## Future expansion

The v1 model already supports router, relayer, paymaster, proxy implementation, and service roles even when the initial migrated dataset has no verified record for every role. Future additions should be source-backed rather than populated from memory or heuristic guesses.
