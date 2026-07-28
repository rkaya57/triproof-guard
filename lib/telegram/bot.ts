import { scanScamGuard, type ScamGuardChain, type ScamGuardRiskLevel, type ScamGuardScanResult, type ScamGuardScanType } from "@/lib/scamguard/engine"

export type TelegramChatType = "private" | "group" | "supergroup" | "channel" | string

export type TelegramMessageEntity = {
  type: string
  offset: number
  length: number
  url?: string
}

export type TelegramMessage = {
  message_id: number
  text?: string
  caption?: string
  chat: {
    id: number
    type: TelegramChatType
    title?: string
    username?: string
  }
  from?: {
    id: number
    is_bot?: boolean
    first_name?: string
    username?: string
    language_code?: string
  }
  entities?: TelegramMessageEntity[]
  caption_entities?: TelegramMessageEntity[]
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

export type TelegramSendMessage = {
  chat_id: number
  text: string
  reply_parameters?: {
    message_id: number
    allow_sending_without_reply?: boolean
  }
  disable_web_page_preview?: boolean
}

export type TelegramBotAction = {
  method: "sendMessage"
  payload: TelegramSendMessage
}

export type TelegramBotContext = {
  publicBaseUrl?: string
  groupAlertLevel?: "CAUTION" | "HIGH_RISK" | "CRITICAL"
}

type ScanCandidate = {
  type: ScamGuardScanType
  value: string
  chain: ScamGuardChain
}

const urlRegex = /\bhttps?:\/\/[^\s<>"')\]]+/gi
const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/
const base64ishRegex = /^[A-Za-z0-9+/=_-]{80,}$/

const riskRank: Record<ScamGuardRiskLevel, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
}

const commandHelp = [
  "SCAMGUARD TELEGRAM BETA",
  "=======================",
  "",
  "Send a URL, wallet, token mint, contract, transaction payload, or suspicious message. ScamGuard will return an explainable pre-sign risk report in seconds.",
  "",
  "Commands",
  "--------",
  "/scan <link|wallet|token|tx>",
  "/wallet <address>",
  "/token <mint|contract>",
  "/tx <transaction payload>",
  "/report <item>",
  "/settings",
  "",
  "Group Guardian",
  "--------------",
  "Add the bot to a Telegram group and it will scan posted links. It only replies when the risk crosses the configured alert threshold.",
].join("\n")

function textOf(message: TelegramMessage) {
  return message.text ?? message.caption ?? ""
}

function cleanUrl(value: string) {
  return value.replace(/[.,!?;:]+$/, "")
}

function parseCommand(text: string) {
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]+))?$/)
  if (!match) return null
  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim() ?? "",
  }
}

function urlEntities(message: TelegramMessage) {
  const sourceText = textOf(message)
  const entities = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
  const urls = new Set<string>()

  for (const entity of entities) {
    if (entity.type === "text_link" && entity.url) urls.add(entity.url)
    if (entity.type === "url") {
      urls.add(sourceText.slice(entity.offset, entity.offset + entity.length))
    }
  }

  for (const match of sourceText.matchAll(urlRegex)) {
    urls.add(match[0])
  }

  return [...urls].map(cleanUrl).filter(Boolean)
}

export function detectScanCandidate(value: string, forcedType?: ScamGuardScanType): ScanCandidate | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (forcedType) {
    return {
      type: forcedType,
      value: trimmed,
      chain: detectChain(trimmed),
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", value: trimmed, chain: "unknown" }
  }

  if (evmAddressRegex.test(trimmed)) {
    return { type: "wallet", value: trimmed, chain: "evm" }
  }

  if (solanaAddressRegex.test(trimmed)) {
    return { type: "wallet", value: trimmed, chain: "solana" }
  }

  if (looksLikeTransaction(trimmed)) {
    return { type: "transaction", value: trimmed, chain: detectChain(trimmed) }
  }

  const firstUrl = trimmed.match(urlRegex)?.[0]
  if (firstUrl) return { type: "url", value: cleanUrl(firstUrl), chain: "unknown" }

  return null
}

function detectChain(value: string): ScamGuardChain {
  if (/0x[a-fA-F0-9]{8,}/.test(value) || /eth_|personal_sign|setApprovalForAll|approve\(/i.test(value)) return "evm"
  if (solanaAddressRegex.test(value) || /solana|spl-token|tokenkeg|approvechecked|setauthority/i.test(value)) return "solana"
  return "unknown"
}

function looksLikeTransaction(value: string) {
  const text = value.toLowerCase()
  return (
    base64ishRegex.test(value) ||
    text.includes("approve") ||
    text.includes("delegate") ||
    text.includes("setauthority") ||
    text.includes("closeaccount") ||
    text.includes("personal_sign") ||
    text.includes("eth_sign") ||
    text.includes("eth_sendtransaction")
  )
}

function levelMeetsThreshold(level: ScamGuardRiskLevel, threshold: NonNullable<TelegramBotContext["groupAlertLevel"]>) {
  return riskRank[level] >= riskRank[threshold]
}

function statusLine(result: ScamGuardScanResult) {
  if (result.riskLevel === "CRITICAL") return "CRITICAL RISK"
  if (result.riskLevel === "HIGH_RISK") return "HIGH RISK"
  if (result.riskLevel === "CAUTION") return "CAUTION"
  return "LOW RISK"
}

function strongestSignals(result: ScamGuardScanResult) {
  return result.signals.slice(0, 4).map((signal, index) => `${index + 1}. ${signal.title}\n   ${signal.detail}`)
}

function divider(label: string) {
  return `\n-- ${label.toUpperCase()} --`
}

function compactTarget(result: ScamGuardScanResult) {
  return (
    result.metadata.domain ??
    result.metadata.walletAddress ??
    result.metadata.contractIntelligence?.target ??
    result.metadata.decodedIntent?.recipient ??
    result.type
  )
}

function scanReportText(result: ScamGuardScanResult, context?: TelegramBotContext) {
  const lines = [
    "SCAMGUARD PRE-SIGN REPORT",
    "=========================",
    "",
    `Status: ${statusLine(result)}`,
    `Shield score: ${result.score}/100`,
    `Confidence: ${result.confidence}`,
    `Target: ${compactTarget(result)}`,
    `Scan type: ${result.type}`,
    "",
    divider("summary"),
    result.summary,
    "",
    divider("decision"),
    result.explanation,
  ]

  const signals = strongestSignals(result)
  if (signals.length) lines.push(divider("evidence"), ...signals)

  if (result.actions.length) lines.push(divider("recommended action"), ...result.actions.slice(0, 3).map((action) => `- ${action}`))

  const reportUrl = context?.publicBaseUrl ? `${context.publicBaseUrl.replace(/\/$/, "")}/scamguard` : null
  if (reportUrl) lines.push(divider("open full scanner"), reportUrl)

  return lines.join("\n").slice(0, 3900)
}

function groupWarningText(result: ScamGuardScanResult) {
  const signals = strongestSignals(result)
  return [
    "SCAMGUARD GROUP GUARDIAN",
    "=======================",
    "",
    `Alert: ${statusLine(result)}`,
    `Shield score: ${result.score}/100`,
    `Target: ${compactTarget(result)}`,
    "",
    divider("summary"),
    result.summary,
    signals.length ? divider("strongest signals") : undefined,
    ...signals.slice(0, 3),
    "",
    "Action: verify the source from an official channel before connecting a wallet or signing anything.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
    .slice(0, 3900)
}

function simpleReply(message: TelegramMessage, text: string): TelegramBotAction {
  return {
    method: "sendMessage",
    payload: {
      chat_id: message.chat.id,
      text,
      reply_parameters: {
        message_id: message.message_id,
        allow_sending_without_reply: true,
      },
      disable_web_page_preview: true,
    },
  }
}

async function scanCandidate(candidate: ScanCandidate) {
  return scanScamGuard({
    type: candidate.type,
    value: candidate.value,
    chain: candidate.chain,
    sourceUrl: candidate.type === "transaction" ? undefined : candidate.value,
  })
}

async function handlePrivateOrCommand(message: TelegramMessage, context: TelegramBotContext) {
  const text = textOf(message).trim()
  const command = parseCommand(text)

  if (command?.name === "start" || command?.name === "help") {
    return [simpleReply(message, commandHelp)]
  }

  if (command?.name === "settings") {
    return [
      simpleReply(
        message,
        [
          "SCAMGUARD SETTINGS",
          "==================",
          "",
          `Group alert threshold: ${context.groupAlertLevel ?? "HIGH_RISK"}`,
          "Data policy: the bot never asks for seed phrases, private keys, wallet passwords, or custody permissions.",
          "History: this beta does not store Telegram scan history yet.",
        ].join("\n")
      ),
    ]
  }

  const forcedType =
    command?.name === "wallet"
      ? "wallet"
      : command?.name === "token"
        ? "token"
        : command?.name === "tx"
          ? "transaction"
          : undefined
  const input = command && (command.name === "scan" || command.name === "report" || forcedType) ? command.args : text
  const candidate = detectScanCandidate(input, forcedType)

  if (!candidate) {
    return [
      simpleReply(
        message,
        "I could not find a URL, wallet, token mint, contract, or transaction payload to scan. Example: /scan https://example.com/claim"
      ),
    ]
  }

  const result = await scanCandidate(candidate)
  return [simpleReply(message, scanReportText(result, context))]
}

async function handleGroupGuardian(message: TelegramMessage, context: TelegramBotContext) {
  const threshold = context.groupAlertLevel ?? "HIGH_RISK"
  const urls = urlEntities(message).slice(0, 5)
  const actions: TelegramBotAction[] = []

  for (const url of urls) {
    const result = await scanCandidate({ type: "url", value: url, chain: "unknown" })
    if (levelMeetsThreshold(result.riskLevel, threshold)) {
      actions.push(simpleReply(message, groupWarningText(result)))
    }
  }

  const command = parseCommand(textOf(message))
  if (command) {
    actions.push(...(await handlePrivateOrCommand(message, context)))
  }

  return actions
}

export async function handleTelegramUpdate(update: TelegramUpdate, context: TelegramBotContext = {}) {
  const message = update.message ?? update.edited_message
  if (!message) return []

  const chatType = message.chat.type
  if (chatType === "group" || chatType === "supergroup") {
    return handleGroupGuardian(message, context)
  }

  if (chatType === "private") {
    return handlePrivateOrCommand(message, context)
  }

  return []
}
