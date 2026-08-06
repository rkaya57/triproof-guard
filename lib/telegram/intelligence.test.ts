import assert from "node:assert/strict"
import test from "node:test"

import {
  extractTelegramOnchainEntities,
  telegramObservationMatchesCampaign,
} from "@/lib/telegram/intelligence"

const solanaMint = "So11111111111111111111111111111111111111112"
const secondSolanaAddress = "9xQeWvG816bUx9EPjHmaT23yvVMpK8zHfHqC7D1dJ9nA"
const evmContract = "0x1111111111111111111111111111111111111111"

test("extracts URL, domain and Solana mint without changing Base58 case", () => {
  const entities = extractTelegramOnchainEntities({
    target: `https://claim.example.com/reward?mint=${solanaMint}`,
    domain: "claim.example.com",
    scanType: "url",
    chain: "unknown",
  })

  assert.ok(entities.some((entity) => entity.kind === "url"))
  assert.ok(entities.some((entity) => entity.kind === "domain" && entity.value === "claim.example.com"))
  assert.ok(
    entities.some(
      (entity) =>
        entity.kind === "token" &&
        entity.chain === "solana" &&
        entity.value === solanaMint
    )
  )
})

test("extracts EVM contract without producing a false Solana identity", () => {
  const entities = extractTelegramOnchainEntities({
    target: `https://app.example.org/claim?contract=${evmContract.toUpperCase().replace("0X", "0x")}`,
    scanType: "url",
    chain: "unknown",
  })

  assert.ok(
    entities.some(
      (entity) =>
        entity.kind === "contract" &&
        entity.chain === "evm" &&
        entity.value === evmContract
    )
  )
  assert.equal(entities.some((entity) => entity.chain === "solana"), false)
})

test("direct token scans retain their semantic type", () => {
  const entities = extractTelegramOnchainEntities({
    target: solanaMint,
    scanType: "token",
    chain: "solana",
  })

  assert.deepEqual(
    entities.map((entity) => [entity.kind, entity.value, entity.chain]),
    [["token", solanaMint, "solana"]]
  )
})

test("campaign relevance requires an exact extracted onchain identity", () => {
  const matching = extractTelegramOnchainEntities({
    target: `https://claim.example.com/?mint=${solanaMint}`,
    scanType: "url",
  })
  const unrelated = extractTelegramOnchainEntities({
    target: `https://claim.example.com/?mint=${secondSolanaAddress}`,
    scanType: "url",
  })

  assert.equal(telegramObservationMatchesCampaign(matching, [solanaMint]), true)
  assert.equal(telegramObservationMatchesCampaign(unrelated, [solanaMint]), false)
})

test("similar Solana addresses are never collapsed through lowercase matching", () => {
  const differentCase = `${solanaMint.slice(0, 1).toLowerCase()}${solanaMint.slice(1)}`
  const entities = extractTelegramOnchainEntities({
    target: `https://claim.example.com/?mint=${differentCase}`,
    scanType: "url",
  })

  assert.equal(telegramObservationMatchesCampaign(entities, [solanaMint]), false)
})

test("malformed percent encoding does not interrupt graph extraction", () => {
  const entities = extractTelegramOnchainEntities({
    target: `https://claim.example.com/%E0%A4%A?mint=${solanaMint}`,
    scanType: "url",
  })

  assert.ok(entities.some((entity) => entity.kind === "url"))
  assert.ok(entities.some((entity) => entity.value === solanaMint))
})
