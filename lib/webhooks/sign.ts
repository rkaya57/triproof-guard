import { createHmac, randomBytes } from "crypto"

export function createWebhookSecret() {
  return `whsec_${randomBytes(24).toString("hex")}`
}

export function webhookSignature(payload: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
}

export function webhookHeaders(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = webhookSignature(payload, secret, timestamp)
  return {
    "content-type": "application/json",
    "user-agent": "Tri-Proof-Webhook/2.3",
    "x-triproof-timestamp": String(timestamp),
    "x-triproof-signature": `v1=${signature}`,
  }
}
