import assert from "node:assert/strict"
import test from "node:test"

import { inspectMetaMaskPhishingConfig, resetMetaMaskPhishingConfigForTests } from "./metamask-phishing-config"

test("matches exact blacklist domains and respects whitelist", async () => {
  const originalFetch = global.fetch
  const originalUrl = process.env.METAMASK_PHISHING_CONFIG_URL
  process.env.METAMASK_PHISHING_CONFIG_URL = "https://fixture.invalid/config.json"
  resetMetaMaskPhishingConfigForTests()
  global.fetch = async () => new Response(JSON.stringify({
    blacklist: ["evil.example", "bad.example"],
    whitelist: ["safe.example"],
  }), { status: 200, headers: { "content-type": "application/json" } })
  try {
    const bad = await inspectMetaMaskPhishingConfig("https://sub.evil.example/claim")
    assert.equal(bad.status, "available")
    assert.equal(bad.matched, true)
    const safe = await inspectMetaMaskPhishingConfig("safe.example")
    assert.equal(safe.matched, false)
  } finally {
    global.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.METAMASK_PHISHING_CONFIG_URL
    else process.env.METAMASK_PHISHING_CONFIG_URL = originalUrl
    resetMetaMaskPhishingConfigForTests()
  }
})

test("fails open when the upstream config is unavailable", async () => {
  const originalFetch = global.fetch
  resetMetaMaskPhishingConfigForTests()
  global.fetch = async () => new Response("down", { status: 503 })
  try {
    const result = await inspectMetaMaskPhishingConfig("evil.example")
    assert.equal(result.status, "unavailable")
    assert.equal(result.matched, false)
  } finally {
    global.fetch = originalFetch
    resetMetaMaskPhishingConfigForTests()
  }
})
