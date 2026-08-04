import assert from "node:assert/strict"
import test from "node:test"

process.env.NEXTAUTH_SECRET = "extension-test-signing-secret"

test("extension access tokens are scoped to the paired browser request", async () => {
  const { createExtensionAccessToken, verifyExtensionAccessToken } = await import("@/lib/extension/auth")
  const token = await createExtensionAccessToken({ userId: "user_1", requestId: "request_1", tokenId: "device_1" })
  assert.deepEqual(await verifyExtensionAccessToken(token), {
    userId: "user_1",
    requestId: "request_1",
    tokenId: "device_1",
  })
})

test("extension access verification rejects ordinary or malformed tokens", async () => {
  const { verifyExtensionAccessToken } = await import("@/lib/extension/auth")
  assert.equal(await verifyExtensionAccessToken("not-a-token"), null)
})
