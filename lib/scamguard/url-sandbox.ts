import * as dns from "node:dns/promises"
import * as http from "node:http"
import * as https from "node:https"
import type { Socket } from "node:net"
import ipaddr from "ipaddr.js"

import { fingerprintHtml, type ScamDnaFingerprintData, type SandboxStaticSignal } from "@/lib/scamguard/html-fingerprint"

export type SandboxResolvedAddress = {
  address: string
  family: 4 | 6
}

export type UrlSandboxReport = {
  status: "complete" | "blocked" | "failed" | "unsupported" | "disabled"
  sourceUrl: string
  finalUrl?: string
  httpStatus?: number
  contentType?: string
  contentBytes?: number
  elapsedMs: number
  redirectChain: string[]
  resolvedAddressCount: number
  blockReason?: string
  error?: string
  fingerprint?: ScamDnaFingerprintData
  signals: SandboxStaticSignal[]
}

export type SandboxResolver = (hostname: string) => Promise<SandboxResolvedAddress[]>

type SandboxConfig = {
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
}

type HttpReadResult = {
  statusCode: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

type LookupOptions = { all?: boolean }
type SingleLookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: 4 | 6) => void
type AllLookupCallback = (error: NodeJS.ErrnoException | null, addresses: SandboxResolvedAddress[]) => void

export class SandboxBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SandboxBlockedError"
  }
}

function envPositiveInteger(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function sandboxConfig(): SandboxConfig {
  return {
    timeoutMs: Math.min(envPositiveInteger("SCAMGUARD_SANDBOX_TIMEOUT_MS", 7_000), 15_000),
    maxBytes: Math.min(envPositiveInteger("SCAMGUARD_SANDBOX_MAX_BYTES", 1_048_576), 2_097_152),
    maxRedirects: Math.min(envPositiveInteger("SCAMGUARD_SANDBOX_MAX_REDIRECTS", 4), 6),
  }
}

function redactUrl(value: string) {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    url.hash = ""
    const sensitiveKeys = /token|secret|code|key|signature|auth|session|password|redirect_uri/i
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveKeys.test(key)) url.searchParams.set(key, "[redacted]")
    }
    return url.toString()
  } catch {
    return value.slice(0, 500)
  }
}

function isPublicAddress(address: string) {
  if (!ipaddr.isValid(address)) return false
  const parsed = ipaddr.process(address)
  return parsed.range() === "unicast"
}

export async function defaultSandboxResolver(hostname: string): Promise<SandboxResolvedAddress[]> {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  return addresses
    .filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6)
    .map((entry) => ({ address: entry.address, family: entry.family }))
}

export async function assertSandboxTarget(value: string | URL, resolver: SandboxResolver = defaultSandboxResolver) {
  const url = typeof value === "string" ? new URL(value) : new URL(value.toString())
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SandboxBlockedError("Only HTTP and HTTPS targets are allowed.")
  }
  if (url.username || url.password) {
    throw new SandboxBlockedError("URLs containing credentials are not allowed.")
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "")
  const addressLiteral = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new SandboxBlockedError("Local and internal hostnames are blocked.")
  }

  const addresses = ipaddr.isValid(addressLiteral)
    ? [{ address: addressLiteral, family: ipaddr.process(addressLiteral).kind() === "ipv4" ? 4 as const : 6 as const }]
    : await resolver(hostname)
  if (!addresses.length) throw new SandboxBlockedError("The hostname did not resolve to a public address.")
  if (addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new SandboxBlockedError("The hostname resolves to a private, local, reserved, or non-routable address.")
  }

  return { url, addresses }
}

function chooseAddress(addresses: SandboxResolvedAddress[]) {
  return addresses.find((entry) => entry.family === 4) ?? addresses[0]
}

function requestOnce(url: URL, addresses: SandboxResolvedAddress[], config: SandboxConfig, remainingMs: number): Promise<HttpReadResult> {
  const transport = url.protocol === "https:" ? https : http
  const pinnedAddress = chooseAddress(addresses)
  const tlsHostname = url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname
  const lookup = ((_hostname: string, options: LookupOptions, callback: SingleLookupCallback | AllLookupCallback) => {
    if (options?.all) {
      (callback as AllLookupCallback)(null, [pinnedAddress])
      return
    }
    (callback as SingleLookupCallback)(null, pinnedAddress.address, pinnedAddress.family)
  }) as NonNullable<http.RequestOptions["lookup"]>

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, result?: HttpReadResult) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else if (result) resolve(result)
    }

    const request = transport.request(url, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "User-Agent": "ScamGuard-URL-Sandbox/1.0 (+https://triproofprotocol.com/scamguard)",
      },
      lookup,
      servername: url.protocol === "https:" && !ipaddr.isValid(tlsHostname) ? tlsHostname : undefined,
      agent: false,
    }, (response) => {
      const statusCode = response.statusCode ?? 0
      const location = response.headers.location
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        finish(undefined, { statusCode, headers: response.headers, body: Buffer.alloc(0) })
        return
      }

      const declaredLength = Number(response.headers["content-length"])
      if (Number.isFinite(declaredLength) && declaredLength > config.maxBytes) {
        response.destroy()
        finish(new SandboxBlockedError(`Response exceeds the ${config.maxBytes}-byte sandbox limit.`))
        return
      }

      const chunks: Buffer[] = []
      let totalBytes = 0
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += buffer.length
        if (totalBytes > config.maxBytes) {
          response.destroy()
          finish(new SandboxBlockedError(`Response exceeds the ${config.maxBytes}-byte sandbox limit.`))
          return
        }
        chunks.push(buffer)
      })
      response.once("end", () => finish(undefined, { statusCode, headers: response.headers, body: Buffer.concat(chunks) }))
      response.once("error", (error) => finish(error))
    })

    request.setTimeout(Math.max(250, remainingMs), () => {
      request.destroy(new Error("Sandbox request timed out."))
    })
    request.once("error", (error) => finish(error))
    request.once("socket", (socket: Socket) => {
      socket.setNoDelay(true)
    })
    request.end()
  })
}

function contentTypeFrom(headers: http.IncomingHttpHeaders) {
  const header = headers["content-type"]
  return Array.isArray(header) ? header[0] : header
}

function isSupportedContentType(contentType?: string) {
  if (!contentType) return true
  return /(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)
}

function redirectSignal(source: URL, finalUrl: URL, redirects: string[]): SandboxStaticSignal[] {
  const signals: SandboxStaticSignal[] = []
  if (source.protocol === "https:" && finalUrl.protocol === "http:") {
    signals.push({
      code: "SANDBOX_HTTPS_DOWNGRADE",
      severity: "medium",
      title: "Redirect downgrades HTTPS",
      detail: "The URL redirects from an encrypted HTTPS page to an unencrypted HTTP destination.",
    })
  }
  if (source.hostname !== finalUrl.hostname) {
    signals.push({
      code: "SANDBOX_CROSS_DOMAIN_REDIRECT",
      severity: redirects.length >= 3 ? "medium" : "low",
      title: "Redirect changes the destination domain",
      detail: `The final sandbox destination is ${finalUrl.hostname}, not ${source.hostname}.`,
    })
  }
  if (redirects.length >= 4) {
    signals.push({
      code: "SANDBOX_REDIRECT_CHAIN",
      severity: "medium",
      title: "Long redirect chain",
      detail: "The passive sandbox followed several validated redirects before reaching the final page.",
    })
  }
  return signals
}

export async function inspectUrlSandbox(
  value: string,
  options: { resolver?: SandboxResolver; enabled?: boolean } = {}
): Promise<UrlSandboxReport> {
  const startedAt = Date.now()
  const sourceUrl = redactUrl(value)
  const enabled = options.enabled ?? process.env.SCAMGUARD_SANDBOX_ENABLED !== "false"
  if (!enabled) {
    return {
      status: "disabled",
      sourceUrl,
      elapsedMs: Date.now() - startedAt,
      redirectChain: [],
      resolvedAddressCount: 0,
      signals: [],
    }
  }

  const config = sandboxConfig()
  const resolver = options.resolver ?? defaultSandboxResolver
  const redirectChain: string[] = []
  let resolvedAddressCount = 0

  try {
    const initial = await assertSandboxTarget(value, resolver)
    const source = initial.url
    let current = initial.url
    let addresses = initial.addresses
    resolvedAddressCount += addresses.length
    const visited = new Set<string>()

    for (let redirectIndex = 0; redirectIndex <= config.maxRedirects; redirectIndex += 1) {
      const currentKey = current.toString()
      if (visited.has(currentKey)) throw new SandboxBlockedError("Redirect loop detected.")
      visited.add(currentKey)

      const remainingMs = config.timeoutMs - (Date.now() - startedAt)
      if (remainingMs <= 0) throw new Error("Sandbox request timed out.")
      const response = await requestOnce(current, addresses, config, remainingMs)
      const location = response.headers.location

      if (response.statusCode >= 300 && response.statusCode < 400 && location) {
        if (redirectIndex >= config.maxRedirects) throw new SandboxBlockedError("Redirect limit exceeded.")
        const nextUrl = new URL(location, current)
        const next = await assertSandboxTarget(nextUrl, resolver)
        redirectChain.push(redactUrl(next.url.toString()))
        current = next.url
        addresses = next.addresses
        resolvedAddressCount += addresses.length
        continue
      }

      const finalUrl = redactUrl(current.toString())
      const contentType = contentTypeFrom(response.headers)
      if (!isSupportedContentType(contentType)) {
        return {
          status: "unsupported",
          sourceUrl,
          finalUrl,
          httpStatus: response.statusCode,
          contentType,
          contentBytes: response.body.length,
          elapsedMs: Date.now() - startedAt,
          redirectChain,
          resolvedAddressCount,
          signals: redirectSignal(source, current, redirectChain),
        }
      }

      const html = response.body.toString("utf8")
      const analyzed = fingerprintHtml({
        html,
        sourceUrl: source.toString(),
        finalUrl: current.toString(),
        redirectChain: [source.toString(), ...redirectChain],
      })
      return {
        status: "complete",
        sourceUrl,
        finalUrl,
        httpStatus: response.statusCode,
        contentType,
        contentBytes: response.body.length,
        elapsedMs: Date.now() - startedAt,
        redirectChain,
        resolvedAddressCount,
        fingerprint: analyzed.fingerprint,
        signals: [...redirectSignal(source, current, redirectChain), ...analyzed.signals],
      }
    }

    throw new SandboxBlockedError("Redirect limit exceeded.")
  } catch (error) {
    const blocked = error instanceof SandboxBlockedError
    return {
      status: blocked ? "blocked" : "failed",
      sourceUrl,
      elapsedMs: Date.now() - startedAt,
      redirectChain,
      resolvedAddressCount,
      blockReason: blocked ? error.message : undefined,
      error: blocked ? undefined : error instanceof Error ? error.message : "Sandbox request failed.",
      signals: blocked
        ? [{
            code: "SANDBOX_TARGET_BLOCKED",
            severity: "low",
            title: "Sandbox could not safely open this target",
            detail: error instanceof Error ? error.message : "The URL did not pass sandbox network policy.",
          }]
        : [],
    }
  }
}
