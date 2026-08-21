import * as dns from "node:dns/promises"
import * as http from "node:http"
import * as https from "node:https"

import ipaddr from "ipaddr.js"

export type WebhookResolvedAddress = {
  address: string
  family: 4 | 6
}

export type WebhookResolver = (hostname: string) => Promise<WebhookResolvedAddress[]>

export type WebhookEgressTarget = {
  url: URL
  addresses: WebhookResolvedAddress[]
  pinnedAddress: WebhookResolvedAddress
}

export type WebhookHttpResult = {
  status: number
  ok: boolean
  body: string
  redirectBlocked: boolean
}

export class WebhookEgressBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebhookEgressBlockedError"
  }
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_DNS_TIMEOUT_MS = 3_000
const DEFAULT_MAX_RESPONSE_BYTES = 65_536

function boundedPositiveInteger(name: string, fallback: number, maximum: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, maximum)
}

function webhookEgressConfig() {
  return {
    timeoutMs: boundedPositiveInteger("WEBHOOK_EGRESS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 30_000),
    dnsTimeoutMs: boundedPositiveInteger("WEBHOOK_EGRESS_DNS_TIMEOUT_MS", DEFAULT_DNS_TIMEOUT_MS, 10_000),
    maxResponseBytes: boundedPositiveInteger(
      "WEBHOOK_EGRESS_MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
      262_144,
    ),
  }
}

function normalizedHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/\.$/, "")
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower
}

export function isPublicWebhookAddress(address: string) {
  if (!ipaddr.isValid(address)) return false
  return ipaddr.process(address).range() === "unicast"
}

export function isAllowedWebhookHostname(hostname: string) {
  const normalized = normalizedHostname(hostname)
  if (!normalized) return false
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return false
  }
  if (ipaddr.isValid(normalized)) return isPublicWebhookAddress(normalized)
  return true
}

export async function defaultWebhookResolver(hostname: string): Promise<WebhookResolvedAddress[]> {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  return addresses
    .filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6)
    .map((entry) => ({ address: entry.address, family: entry.family }))
}

async function resolveWebhookAddresses(
  hostname: string,
  resolver: WebhookResolver,
  timeoutMs: number,
): Promise<WebhookResolvedAddress[]> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new WebhookEgressBlockedError("Webhook DNS resolution timed out."))
        }, timeoutMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function resolveWebhookEgressTarget(
  value: string | URL,
  resolver: WebhookResolver = defaultWebhookResolver,
  options: { dnsTimeoutMs?: number } = {},
): Promise<WebhookEgressTarget> {
  const url = typeof value === "string" ? new URL(value) : new URL(value.toString())
  const production = process.env.NODE_ENV === "production"

  if (production && url.protocol !== "https:") {
    throw new WebhookEgressBlockedError("Production webhook delivery requires HTTPS.")
  }
  if (!production && url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WebhookEgressBlockedError("Webhook delivery supports only HTTP and HTTPS targets.")
  }
  if (url.username || url.password) {
    throw new WebhookEgressBlockedError("Webhook destinations containing credentials are blocked.")
  }
  if (!isAllowedWebhookHostname(url.hostname)) {
    throw new WebhookEgressBlockedError("Local, private, reserved, or internal webhook destinations are blocked.")
  }

  const hostname = normalizedHostname(url.hostname)
  const config = webhookEgressConfig()
  const dnsTimeoutMs = Math.min(
    Math.max(1, options.dnsTimeoutMs ?? config.dnsTimeoutMs),
    10_000,
  )
  const addresses = ipaddr.isValid(hostname)
    ? [{
        address: hostname,
        family: ipaddr.process(hostname).kind() === "ipv4" ? 4 as const : 6 as const,
      }]
    : await resolveWebhookAddresses(hostname, resolver, dnsTimeoutMs)

  if (!addresses.length) {
    throw new WebhookEgressBlockedError("Webhook destination did not resolve to a public address.")
  }
  if (addresses.some((entry) => !isPublicWebhookAddress(entry.address))) {
    throw new WebhookEgressBlockedError(
      "Webhook destination resolves to a private, local, reserved, or non-routable address.",
    )
  }

  const pinnedAddress = addresses.find((entry) => entry.family === 4) ?? addresses[0]
  return { url, addresses, pinnedAddress }
}

type LookupOptions = { all?: boolean }
type SingleLookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: 4 | 6) => void
type AllLookupCallback = (error: NodeJS.ErrnoException | null, addresses: WebhookResolvedAddress[]) => void

export async function sendWebhookRequest(input: {
  url: string
  body: string
  headers: Record<string, string>
  resolver?: WebhookResolver
}): Promise<WebhookHttpResult> {
  const target = await resolveWebhookEgressTarget(input.url, input.resolver)
  const config = webhookEgressConfig()
  const transport = target.url.protocol === "https:" ? https : http
  const tlsHostname = normalizedHostname(target.url.hostname)

  const lookup = ((_hostname: string, options: LookupOptions, callback: SingleLookupCallback | AllLookupCallback) => {
    if (options?.all) {
      ;(callback as AllLookupCallback)(null, [target.pinnedAddress])
      return
    }
    ;(callback as SingleLookupCallback)(null, target.pinnedAddress.address, target.pinnedAddress.family)
  }) as NonNullable<http.RequestOptions["lookup"]>

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, result?: WebhookHttpResult) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else if (result) resolve(result)
    }

    const request = transport.request(target.url, {
      method: "POST",
      headers: input.headers,
      lookup,
      servername: target.url.protocol === "https:" && !ipaddr.isValid(tlsHostname) ? tlsHostname : undefined,
      agent: false,
    }, (response) => {
      const status = response.statusCode ?? 0
      const chunks: Buffer[] = []
      let totalBytes = 0

      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += buffer.length
        if (totalBytes > config.maxResponseBytes) {
          response.destroy(new WebhookEgressBlockedError("Webhook response exceeded the configured size limit."))
          return
        }
        chunks.push(buffer)
      })
      response.once("end", () => {
        finish(undefined, {
          status,
          ok: status >= 200 && status < 300,
          body: Buffer.concat(chunks).toString("utf8").slice(0, config.maxResponseBytes),
          redirectBlocked: status >= 300 && status < 400,
        })
      })
      response.once("error", (error) => finish(error))
    })

    request.setTimeout(config.timeoutMs, () => {
      request.destroy(new Error("Webhook delivery timed out."))
    })
    request.once("error", (error) => finish(error))
    request.end(input.body)
  })
}

export function webhookDeliveryErrorMessage(result: WebhookHttpResult) {
  if (result.ok) return null
  if (result.redirectBlocked) return `Webhook redirect blocked (HTTP ${result.status})`
  return `HTTP ${result.status}`
}
