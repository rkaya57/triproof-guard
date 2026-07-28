import assert from "node:assert/strict"
import test from "node:test"

import { assertSandboxTarget, inspectUrlSandbox, SandboxBlockedError, type SandboxResolver } from "./url-sandbox"

const publicResolver: SandboxResolver = async () => [{ address: "93.184.216.34", family: 4 }]

test("URL sandbox permits a public HTTP target", async () => {
  const result = await assertSandboxTarget("https://example.com/path", publicResolver)
  assert.equal(result.url.hostname, "example.com")
  assert.equal(result.addresses[0].address, "93.184.216.34")
})

test("URL sandbox blocks local, credential, and non-HTTP targets", async () => {
  await assert.rejects(() => assertSandboxTarget("http://127.0.0.1/admin", publicResolver), SandboxBlockedError)
  await assert.rejects(() => assertSandboxTarget("http://[::1]/admin", publicResolver), SandboxBlockedError)
  await assert.rejects(() => assertSandboxTarget("https://user:pass@example.com", publicResolver), SandboxBlockedError)
  await assert.rejects(() => assertSandboxTarget("file:///etc/passwd", publicResolver), SandboxBlockedError)
  await assert.rejects(() => assertSandboxTarget("http://service.internal", publicResolver), SandboxBlockedError)
})

test("URL sandbox fails closed when any DNS answer is private", async () => {
  const mixedResolver: SandboxResolver = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.5", family: 4 },
  ]
  await assert.rejects(() => assertSandboxTarget("https://mixed.example", mixedResolver), SandboxBlockedError)
})

test("URL sandbox can be explicitly disabled without network access", async () => {
  const result = await inspectUrlSandbox("https://example.com", { enabled: false })
  assert.equal(result.status, "disabled")
  assert.equal(result.resolvedAddressCount, 0)
})
