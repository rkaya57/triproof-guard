import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  classifyEvmContractSource,
  evmParticipantEntityType,
  normalizeEvmCreationProvenance,
  normalizeEvmProvenanceAddress,
} from "@/lib/onchain/evm-contract-intelligence"

describe("EVM contract provenance intelligence", () => {
  it("separates a contract factory from the transaction deployer", () => {
    const provenance = normalizeEvmCreationProvenance({
      contractCreator: "0x1111111111111111111111111111111111111111",
      contractFactory: "0x2222222222222222222222222222222222222222",
      txHash: "0xABCDEF",
      blockNumber: "123",
      timestamp: "1700000000",
    })

    assert.equal(provenance.deployerAddress, "0x1111111111111111111111111111111111111111")
    assert.equal(provenance.factoryAddress, "0x2222222222222222222222222222222222222222")
    assert.equal(provenance.transactionHash, "0xabcdef")
  })

  it("drops empty and zero-address factory provenance", () => {
    assert.equal(normalizeEvmProvenanceAddress(""), null)
    assert.equal(
      normalizeEvmProvenanceAddress("0x0000000000000000000000000000000000000000"),
      null
    )
  })

  it("distinguishes Safe smart accounts from generic multisig and proxy contracts", () => {
    const safe = classifyEvmContractSource({
      ContractName: "SafeProxy",
      Proxy: "1",
      Implementation: "0x3333333333333333333333333333333333333333",
      ABI: "getOwners getThreshold execTransaction",
    })
    const multisig = classifyEvmContractSource({
      ContractName: "TreasuryMultiSig",
      ABI: "owners threshold",
    })
    const proxy = classifyEvmContractSource({
      ContractName: "TransparentUpgradeableProxy",
      Proxy: "1",
      Implementation: "0x4444444444444444444444444444444444444444",
    })

    assert.equal(safe.subtype, "safe_multisig")
    assert.equal(safe.safe, true)
    assert.equal(evmParticipantEntityType(safe), "user")
    assert.equal(multisig.subtype, "multisig")
    assert.equal(evmParticipantEntityType(multisig), "contract")
    assert.equal(proxy.subtype, "proxy")
    assert.equal(evmParticipantEntityType(proxy), "contract")
  })

  it("keeps bridge classification ahead of proxy/multisig heuristics", () => {
    const bridge = classifyEvmContractSource({
      ContractName: "OptimismPortalProxy",
      Proxy: "1",
      Implementation: "0x5555555555555555555555555555555555555555",
    })
    assert.equal(bridge.subtype, "bridge")
    assert.equal(evmParticipantEntityType(bridge), "bridge")
  })
})
