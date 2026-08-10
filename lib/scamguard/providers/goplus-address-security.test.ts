import assert from "node:assert/strict"
import test from "node:test"

import { inspectGoPlusAddressSecurity, resetGoPlusAddressSecurityForTests } from "./goplus-address-security"

const originalFetch = globalThis.fetch
const originalKey = process.env.GOPLUS_APP_KEY
const originalSecret = process.env.GOPLUS_APP_SECRET

function restore() {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.GOPLUS_APP_KEY
  else process.env.GOPLUS_APP_KEY = originalKey
  if (originalSecret === undefined) delete process.env.GOPLUS_APP_SECRET
  else process.env.GOPLUS_APP_SECRET = originalSecret
  resetGoPlusAddressSecurityForTests()
}

test.afterEach(restore)

test("provider is disabled without credentials and makes no network calls", async () => {
  delete process.env.GOPLUS_APP_KEY
  delete process.env.GOPLUS_APP_SECRET
  let called = false
  globalThis.fetch = async () => { called = true; return new Response("", { status: 500 }) }
  const result = await inspectGoPlusAddressSecurity("0x1111111111111111111111111111111111111111")
  assert.equal(result.status, "disabled")
  assert.equal(result.matched, false)
  assert.equal(called, false)
})

test("explicit phishing and stealing flags become malicious behaviors", async () => {
  process.env.GOPLUS_APP_KEY = "test-key"
  process.env.GOPLUS_APP_SECRET = "test-secret"
  const address = "0x2222222222222222222222222222222222222222"
  let calls = 0
  globalThis.fetch = async (input, init) => {
    calls += 1
    const url = String(input)
    if (url.endsWith("/api/v1/token")) {
      return Response.json({ code: 1, result: { access_token: "token-1", expires_in: 3600 } })
    }
    assert.match(String((init?.headers as Record<string, string>)?.authorization ?? ""), /^Bearer /)
    return Response.json({ code: 1, result: { [address]: { phishing_activities: "1", stealing_attack: "1", sanctioned: "1", data_source: "GoPlus" } } })
  }
  const result = await inspectGoPlusAddressSecurity(address)
  assert.equal(result.status, "available")
  assert.equal(result.matched, true)
  assert.deepEqual(result.maliciousBehaviors.sort(), ["phishing_activities", "stealing_attack"])
  assert.equal(result.dataSource, "GoPlus")
  assert.equal(calls, 2)
})

test("capability or compliance-only flags do not manufacture malicious evidence", async () => {
  process.env.GOPLUS_APP_KEY = "test-key"
  process.env.GOPLUS_APP_SECRET = "test-secret"
  const address = "0x3333333333333333333333333333333333333333"
  globalThis.fetch = async (input) => String(input).endsWith("/api/v1/token")
    ? Response.json({ code: 1, result: { access_token: "token-2", expires_in: 3600 } })
    : Response.json({ code: 1, result: { [address]: { sanctioned: "1", mixer: "1", reinit: "1", fake_standard_interface: "1" } } })
  const result = await inspectGoPlusAddressSecurity(address)
  assert.equal(result.status, "available")
  assert.equal(result.matched, false)
  assert.deepEqual(result.maliciousBehaviors, [])
})

test("token access is cached for repeated lookups", async () => {
  process.env.GOPLUS_APP_KEY = "test-key"
  process.env.GOPLUS_APP_SECRET = "test-secret"
  let tokenCalls = 0
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/api/v1/token")) {
      tokenCalls += 1
      return Response.json({ code: 1, result: { access_token: "token-3", expires_in: 3600 } })
    }
    return Response.json({ code: 1, result: { phishing_activities: "0" } })
  }
  await inspectGoPlusAddressSecurity("0x4444444444444444444444444444444444444444")
  await inspectGoPlusAddressSecurity("0x5555555555555555555555555555555555555555")
  assert.equal(tokenCalls, 1)
})
