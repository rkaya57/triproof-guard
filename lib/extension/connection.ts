import { createHash, randomBytes } from "node:crypto"

export const extensionConnectDurationMs = 10 * 60 * 1000
export const extensionAccessDurationMs = 30 * 24 * 60 * 60 * 1000

export function createExtensionVerificationCode() {
  return randomBytes(3).toString("hex").toUpperCase()
}

export function createExtensionPollToken() {
  return randomBytes(32).toString("base64url")
}

export function createExtensionTokenId() {
  return randomBytes(20).toString("base64url")
}

export function hashExtensionSecret(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex")
}
