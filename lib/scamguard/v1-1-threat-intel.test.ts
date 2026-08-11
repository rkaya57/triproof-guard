import assert from "node:assert/strict"
import test from "node:test"

import { parseV11ThreatFeedPayload } from "@/lib/scamguard/v1-1-threat-intel"

test("V1.1 threat parser extracts exact domains and EVM addresses", () => {
  const parsed = parseV11ThreatFeedPayload(JSON.stringify({
    blacklist: [
      "https://bad.example/claim",
      "0xAbCdEf0123456789aBCdef0123456789ABCdEf01",
    ],
  }))

  assert.equal(parsed.domains.has("bad.example"), true)
  assert.equal(parsed.domains.has("claim.bad.example"), false)
  assert.equal(parsed.evmAddresses.has("0xabcdef0123456789abcdef0123456789abcdef01"), true)
})

test("V1.1 threat parser accepts newline feeds without fuzzy expansion", () => {
  const parsed = parseV11ThreatFeedPayload("evil.example\n0x1111111111111111111111111111111111111111\n")
  assert.deepEqual([...parsed.domains], ["evil.example"])
  assert.deepEqual([...parsed.evmAddresses], ["0x1111111111111111111111111111111111111111"])
})
