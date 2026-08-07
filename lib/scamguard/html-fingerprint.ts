import crypto from "node:crypto"

export type SandboxStaticSignal = {
  code: string
  severity: "info" | "low" | "medium" | "high" | "critical"
  title: string
  detail: string
}

export type ScamDnaFingerprintData = {
  contentHash: string
  domHash: string
  scriptHash: string
  textHash: string
  styleHash: string
  faviconUrlHash: string
  redirectHash: string
  behaviorHash: string
  fingerprintKey: string
  clusterKey: string
  behaviorFlags: string[]
  chainHints: Array<"solana" | "evm">
  walletTargets: string[]
  programTargets: string[]
  featureTokens: string[]
  stats: {
    tagCount: number
    scriptCount: number
    formCount: number
    iframeCount: number
    externalScriptCount: number
  }
}

type ParsedTag = {
  name: string
  closing: boolean
  attrs: Record<string, string>
}

type ParsedDocument = {
  tags: ParsedTag[]
  visibleText: string[]
  scripts: string[]
  styles: string[]
}

const evmAddressPattern = /\b0x[a-fA-F0-9]{40}\b/g
const solanaAddressPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])
const selectedDomAttributes = new Set(["action", "aria-label", "autocomplete", "download", "href", "id", "method", "name", "rel", "role", "src", "type"])

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
}

function findTagEnd(html: string, start: number) {
  let quote = ""
  for (let index = start; index < html.length; index += 1) {
    const character = html[index]
    if (quote) {
      if (character === quote && html[index - 1] !== "\\") quote = ""
      continue
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === ">") return index
  }
  return -1
}

function parseAttributes(source: string) {
  const attrs: Record<string, string> = {}
  let index = 0

  while (index < source.length) {
    while (index < source.length && /[\s/]/.test(source[index])) index += 1
    const nameStart = index
    while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1
    const name = source.slice(nameStart, index).trim().toLowerCase()
    if (!name) {
      index += 1
      continue
    }

    while (index < source.length && /\s/.test(source[index])) index += 1
    let value = ""
    if (source[index] === "=") {
      index += 1
      while (index < source.length && /\s/.test(source[index])) index += 1
      const quote = source[index]
      if (quote === "\"" || quote === "'" || quote === "`") {
        index += 1
        const valueStart = index
        while (index < source.length && (source[index] !== quote || source[index - 1] === "\\")) index += 1
        value = source.slice(valueStart, index)
        if (source[index] === quote) index += 1
      } else {
        const valueStart = index
        while (index < source.length && !/[\s>]/.test(source[index])) index += 1
        value = source.slice(valueStart, index)
      }
    }
    attrs[name] = decodeHtml(value.slice(0, 2048))
  }

  return attrs
}

function parseTag(source: string): ParsedTag | null {
  const trimmed = source.trim()
  if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("?")) return null
  const closing = trimmed.startsWith("/")
  const body = closing ? trimmed.slice(1).trimStart() : trimmed
  const match = body.match(/^([a-zA-Z][a-zA-Z0-9:-]*)/)
  if (!match) return null
  return {
    name: match[1].toLowerCase(),
    closing,
    attrs: closing ? {} : parseAttributes(body.slice(match[0].length)),
  }
}

function parseDocument(html: string): ParsedDocument {
  const tags: ParsedTag[] = []
  const visibleText: string[] = []
  const scripts: string[] = []
  const styles: string[] = []
  const lowerHtml = html.toLowerCase()
  let index = 0

  while (index < html.length && tags.length < 10_000) {
    const tagStart = html.indexOf("<", index)
    if (tagStart === -1) {
      visibleText.push(html.slice(index))
      break
    }
    if (tagStart > index) visibleText.push(html.slice(index, tagStart))
    if (html.startsWith("<!--", tagStart)) {
      const commentEnd = html.indexOf("-->", tagStart + 4)
      index = commentEnd === -1 ? html.length : commentEnd + 3
      continue
    }

    const tagEnd = findTagEnd(html, tagStart + 1)
    if (tagEnd === -1) break
    const tag = parseTag(html.slice(tagStart + 1, tagEnd))
    index = tagEnd + 1
    if (!tag) continue
    tags.push(tag)

    if (tag.closing || voidTags.has(tag.name)) continue
    if (tag.name !== "script" && tag.name !== "style" && tag.name !== "noscript" && tag.name !== "template") continue

    const closeMarker = `</${tag.name}`
    const closeStart = lowerHtml.indexOf(closeMarker, index)
    const blockEnd = closeStart === -1 ? html.length : closeStart
    if (tag.name === "script") scripts.push(html.slice(index, blockEnd))
    if (tag.name === "style") styles.push(html.slice(index, blockEnd))
    index = blockEnd
  }

  return { tags, visibleText, scripts, styles }
}

function stableToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[a-f0-9]{12,}/g, "<hash>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
}

function normalizeAssetUrl(value: string, baseUrl: URL) {
  if (!value || value.startsWith("data:") || value.startsWith("javascript:")) return ""
  try {
    const url = new URL(value, baseUrl)
    const host = url.hostname === baseUrl.hostname ? "@self" : url.hostname
    return `${host}${url.pathname}`
      .toLowerCase()
      .replace(/[a-f0-9]{12,}/g, "<hash>")
      .replace(/\d+/g, "<n>")
      .slice(0, 300)
  } catch {
    return stableToken(value)
  }
}

function normalizeScript(value: string) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, "<str>")
    .replace(/\b\d+(?:\.\d+)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100_000)
}

function normalizeText(value: string) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(evmAddressPattern, "<evm-address>")
    .replace(solanaAddressPattern, "<solana-address>")
    .replace(/\b\d+(?:[.,]\d+)?\b/g, "<n>")
    .replace(/[^\p{L}\p{N}<>'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50_000)
}

function distinctMatches(value: string, pattern: RegExp, limit = 30) {
  const matches = value.match(pattern) ?? []
  return [...new Set(matches.map((match) => match.trim()))].slice(0, limit)
}

function jaccardTokens(flags: string[], assets: string[], tags: string[]) {
  return [...new Set([...flags.map((flag) => `behavior:${flag}`), ...assets.map((asset) => `asset:${asset}`), ...tags.slice(0, 100).map((tag) => `tag:${tag}`)])]
    .sort()
    .slice(0, 250)
}

function addBehavior(flags: Set<string>, condition: boolean, flag: string) {
  if (condition) flags.add(flag)
}

const secretMaterialTerms = ["seed phrase", "recovery phrase", "secret phrase", "private key", "mnemonic"]
const secretRequestLanguage = /\b(?:ask|asks|request|requests|required|enter|paste|type|submit|provide|send|share|import|restore|verify|confirm|reveal|input|upload)\b/i
const protectiveSecretLanguage = /\b(?:never|do not|don't|will not|won't|should not|must not|no need to|without sharing)\b/i

function hasExplicitSecretMaterialRequest(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase()
  for (const term of secretMaterialTerms) {
    let index = normalized.indexOf(term)
    while (index !== -1) {
      const start = Math.max(0, index - 120)
      const end = Math.min(normalized.length, index + term.length + 120)
      const context = normalized.slice(start, end)
      if (secretRequestLanguage.test(context) && !protectiveSecretLanguage.test(context)) return true
      index = normalized.indexOf(term, index + term.length)
    }
  }
  return false
}

export function fingerprintHtml(input: {
  html: string
  sourceUrl: string
  finalUrl: string
  redirectChain: string[]
}): { fingerprint: ScamDnaFingerprintData; signals: SandboxStaticSignal[] } {
  const baseUrl = new URL(input.finalUrl)
  const document = parseDocument(input.html)
  const openingTags = document.tags.filter((tag) => !tag.closing)
  const scripts = openingTags.filter((tag) => tag.name === "script")
  const forms = openingTags.filter((tag) => tag.name === "form")
  const iframes = openingTags.filter((tag) => tag.name === "iframe")
  const links = openingTags.filter((tag) => tag.name === "link")
  const inputs = openingTags.filter((tag) => tag.name === "input" || tag.name === "textarea")
  const externalScripts = scripts
    .map((tag) => normalizeAssetUrl(tag.attrs.src, baseUrl))
    .filter(Boolean)
  const favicon = links.find((tag) => /\b(?:icon|shortcut icon)\b/i.test(tag.attrs.rel ?? ""))
  const faviconAsset = normalizeAssetUrl(favicon?.attrs.href ?? "/favicon.ico", baseUrl)

  const domTokens = document.tags.slice(0, 8_000).map((tag) => {
    if (tag.closing) return `/${tag.name}`
    const attrs = Object.entries(tag.attrs)
      .filter(([name]) => selectedDomAttributes.has(name))
      .map(([name, value]) => {
        if (name === "src" || name === "href" || name === "action") return `${name}=${normalizeAssetUrl(value, baseUrl)}`
        return `${name}=${stableToken(value)}`
      })
      .sort()
      .slice(0, 6)
    return attrs.length ? `${tag.name}[${attrs.join(",")}]` : tag.name
  })

  const inlineScripts = document.scripts.map(normalizeScript).filter(Boolean)
  const scriptMaterial = [...externalScripts.sort(), ...inlineScripts].join("\n")
  const styleAssets = links
    .filter((tag) => /\bstylesheet\b/i.test(tag.attrs.rel ?? ""))
    .map((tag) => normalizeAssetUrl(tag.attrs.href, baseUrl))
    .filter(Boolean)
  const styleMaterial = [...styleAssets.sort(), ...document.styles.map((style) => stableToken(style).slice(0, 30_000))].join("\n")
  const visibleText = normalizeText(document.visibleText.join(" "))
  const searchableHtml = `${input.html}\n${scriptMaterial}`.slice(0, 1_500_000)
  const lowerSearchable = searchableHtml.toLowerCase()

  const behaviorFlags = new Set<string>()
  addBehavior(behaviorFlags, /navigator\.clipboard|document\.execcommand\s*\(\s*["']copy/i.test(searchableHtml), "clipboard_access")
  addBehavior(behaviorFlags, /eth_requestaccounts|solana\.connect\s*\(|window\.ethereum\.request/i.test(searchableHtml), "wallet_connect_request")
  addBehavior(behaviorFlags, /signtransaction|signalltransactions|signmessage|personal_sign|eth_sendtransaction|setapprovalforall|wallet_switchethereumchain/i.test(searchableHtml), "wallet_signing_api")
  addBehavior(behaviorFlags, hasExplicitSecretMaterialRequest(visibleText), "secret_material_request")
  addBehavior(behaviorFlags, /\beval\s*\(|new\s+function\s*\(|\batob\s*\(|fromcharcode\s*\(|(?:[A-Za-z0-9+/]{400,}={0,2})/i.test(searchableHtml), "obfuscated_script")
  addBehavior(
    behaviorFlags,
    /(?:\.download\s*=|setattribute\s*\(\s*["']download["'])[\s\S]{0,1200}\.click\s*\(/i.test(searchableHtml)
      || /location\.(?:href|assign)\s*=\s*["'][^"']+\.(?:exe|msi|dmg|pkg|zip)/i.test(searchableHtml),
    "automatic_download"
  )
  addBehavior(behaviorFlags, /countdown|timeleft|expiresin|claimnow|limitedtime/i.test(lowerSearchable), "urgency_countdown")

  const hiddenIframe = iframes.some((tag) => {
    const marker = `${tag.attrs.style ?? ""} ${tag.attrs.hidden ?? ""} ${tag.attrs.width ?? ""} ${tag.attrs.height ?? ""}`.toLowerCase()
    return /display\s*:\s*none|visibility\s*:\s*hidden|\b0(?:px)?\b/.test(marker)
  })
  addBehavior(behaviorFlags, hiddenIframe, "hidden_iframe")

  const externalForms = forms.filter((tag) => {
    if (!tag.attrs.action) return false
    try {
      return new URL(tag.attrs.action, baseUrl).origin !== baseUrl.origin
    } catch {
      return true
    }
  })
  addBehavior(behaviorFlags, externalForms.length > 0, "cross_origin_form")

  const sensitiveInputs = inputs.filter((tag) => {
    const marker = `${tag.attrs.name ?? ""} ${tag.attrs.id ?? ""} ${tag.attrs.placeholder ?? ""} ${tag.attrs["aria-label"] ?? ""}`
    return /seed|mnemonic|private.?key|recovery.?phrase|secret.?phrase/i.test(marker)
  })
  addBehavior(behaviorFlags, sensitiveInputs.length > 0, "secret_input_field")

  const walletTargets = distinctMatches(searchableHtml, evmAddressPattern).map((address) => address.toLowerCase())
  const programTargets = distinctMatches(searchableHtml, solanaAddressPattern)
  const chainHints = new Set<"solana" | "evm">()
  if (
    walletTargets.length > 0
    || /window\.ethereum|eth_requestaccounts|eth_sendtransaction|eth_signtypeddata|wallet_switchethereumchain|metamask|walletconnect|\b(?:wagmi|viem|ethers)\b/i.test(searchableHtml)
  ) {
    chainHints.add("evm")
  }
  if (
    programTargets.length > 0
    || /solana\.connect\s*\(|signalltransactions|phantom|solflare|backpack|@solana\/web3/i.test(searchableHtml)
  ) {
    chainHints.add("solana")
  }
  const sortedFlags = [...behaviorFlags].sort()
  const featureTokens = jaccardTokens(sortedFlags, [...externalScripts, ...styleAssets], domTokens)
  const domHash = sha256(domTokens.join("|"))
  const scriptHash = sha256(scriptMaterial)
  const textHash = sha256(visibleText)
  const styleHash = sha256(styleMaterial)
  const redirectHash = sha256(input.redirectChain.map((value) => {
    try {
      const url = new URL(value)
      return `${url.protocol}${url.pathname}`
    } catch {
      return value
    }
  }).join("|"))
  const behaviorHash = sha256(featureTokens.join("|"))
  const contentHash = sha256(input.html)
  const faviconUrlHash = sha256(faviconAsset)
  const fingerprintKey = sha256(`${baseUrl.hostname}|${contentHash}|${behaviorHash}`)
  const clusterKey = sha256(`${domHash}|${scriptHash}|${behaviorHash}|${redirectHash}`)

  const signals: SandboxStaticSignal[] = []
  if (sortedFlags.includes("secret_material_request") || sortedFlags.includes("secret_input_field")) {
    signals.push({
      code: "SANDBOX_SECRET_REQUEST",
      severity: "critical",
      title: "Page requests secret wallet material",
      detail: "The passive sandbox found seed phrase, recovery phrase, mnemonic, or private-key collection patterns in the page.",
    })
  }
  if (sortedFlags.includes("cross_origin_form") && sensitiveInputs.length > 0) {
    signals.push({
      code: "SANDBOX_EXTERNAL_SECRET_FORM",
      severity: "critical",
      title: "Secret form posts to another origin",
      detail: "A sensitive form sends data to a different origin than the page being scanned.",
    })
  } else if (sortedFlags.includes("cross_origin_form")) {
    signals.push({
      code: "SANDBOX_CROSS_ORIGIN_FORM",
      severity: "medium",
      title: "Form submits to another origin",
      detail: "The page contains a form whose submission target is on a different origin. Verify the destination before entering data.",
    })
  }
  if (sortedFlags.includes("hidden_iframe") && sortedFlags.includes("wallet_signing_api")) {
    signals.push({
      code: "SANDBOX_HIDDEN_WALLET_FRAME",
      severity: "high",
      title: "Hidden frame near wallet signing code",
      detail: "Static page analysis found a hidden iframe together with wallet signing APIs, a pattern that needs independent review.",
    })
  }
  if (sortedFlags.includes("obfuscated_script") && sortedFlags.includes("wallet_signing_api")) {
    signals.push({
      code: "SANDBOX_OBFUSCATED_WALLET_CODE",
      severity: "high",
      title: "Obfuscated wallet interaction code",
      detail: "The page combines script-obfuscation patterns with wallet signing APIs.",
    })
  } else if (sortedFlags.includes("obfuscated_script")) {
    signals.push({
      code: "SANDBOX_OBFUSCATED_SCRIPT",
      severity: "low",
      title: "Heavily encoded script content",
      detail: "The passive sandbox found encoding or dynamic-code patterns. Bundled applications can trigger this, so it is treated as supporting context.",
    })
  }
  if (sortedFlags.includes("automatic_download")) {
    signals.push({
      code: "SANDBOX_AUTOMATIC_DOWNLOAD",
      severity: "medium",
      title: "Automatic download behavior",
      detail: "The page contains download triggers or code that redirects to an executable or archive.",
    })
  }

  return {
    fingerprint: {
      contentHash,
      domHash,
      scriptHash,
      textHash,
      styleHash,
      faviconUrlHash,
      redirectHash,
      behaviorHash,
      fingerprintKey,
      clusterKey,
      behaviorFlags: sortedFlags,
      chainHints: [...chainHints].sort() as Array<"solana" | "evm">,
      walletTargets,
      programTargets,
      featureTokens,
      stats: {
        tagCount: openingTags.length,
        scriptCount: scripts.length,
        formCount: forms.length,
        iframeCount: iframes.length,
        externalScriptCount: externalScripts.length,
      },
    },
    signals,
  }
}