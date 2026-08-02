import { scanScamGuard, type ScamGuardChain, type ScamGuardRiskLevel, type ScamGuardScanResult, type ScamGuardScanType } from "@/lib/scamguard/engine"
import { generateScamGuardAiReply } from "@/lib/ai/scamguard-reply"
import { TeamPolicyAction } from "@prisma/client"

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
  callback_query?: {
    id: string
    data?: string
    from?: { id: number }
    message?: { chat: { id: number; type: TelegramChatType } }
  }
}

export type TelegramSendMessage = {
  chat_id: number
  text: string
  reply_parameters?: {
    message_id: number
    allow_sending_without_reply?: boolean
  }
  disable_web_page_preview?: boolean
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  }
}

export type TelegramBotAction = {
  method: "sendMessage"
  payload: TelegramSendMessage
}

export type TelegramBotContext = {
  publicBaseUrl?: string
  geminiConfigured?: boolean
  groupAlertLevel?: "CAUTION" | "HIGH_RISK" | "CRITICAL"
  groupSettings?: {
    guardianEnabled: boolean
    allowlisted: boolean
    alertLevel: "CAUTION" | "HIGH_RISK" | "CRITICAL"
    dailySummary: boolean
  }
  isGroupAdmin?: (chatId: number, userId: number) => Promise<boolean>
  updateGroupSettings?: (
    chatId: number,
    values: {
      guardianEnabled?: boolean
      alertLevel?: "CAUTION" | "HIGH_RISK" | "CRITICAL"
      dailySummary?: boolean
    }
  ) => Promise<{
    guardianEnabled: boolean
    allowlisted: boolean
    alertLevel: "CAUTION" | "HIGH_RISK" | "CRITICAL"
    dailySummary: boolean
  }>
  claimGroup?: (chatId: number, code: string) => Promise<{ ok: boolean; reason?: string; title?: string; plan?: string }>
  authorizeGroupManager?: (chatId: number, userId: number) => Promise<boolean>
  loadHistory?: (chatId: number, limit?: number) => Promise<
    Array<{
      target: string
      domain: string | null
      scanType: string
      riskLevel: string
      score: number
      alerted: boolean
      createdAt: Date
    }>
  >
  loadSummary?: (chatId: number, hours?: number) => Promise<{
    hours: number
    total: number
    alerts: number
    critical: number
    repeated: number
  }>
  recordScan?: (input: {
    message: TelegramMessage
    candidate: ScanCandidate
    result: ScamGuardScanResult
    source: "PRIVATE_COMMAND" | "GROUP_GUARDIAN"
    alerted: boolean
  }) => Promise<{
    eventId?: string
    occurrenceCount: number
    repeatedCampaign: boolean
    senderBehavior?: {
      recentPosts: number
      highRiskPosts: number
      repeatTargetPosts: number
      moderationRecommended: boolean
    }
  }>
  applyTeamPolicy?: (input: { candidate: ScanCandidate; result: ScamGuardScanResult; chatId: number }) => Promise<{ action: TeamPolicyAction; matched: Array<{ policyName: string; reason: string }> }>
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
const solanaSystemProgramId = "11111111111111111111111111111111"
const splTokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN"

const riskRank: Record<ScamGuardRiskLevel, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
}

const commandHelp = [
  "🛡️ SCAMGUARD BOT",
  "Pre-sign intelligence for Web3",
  "━━━━━━━━━━━━━━━━━━━━",
  "",
  "Send a URL, wallet, token mint, contract, transaction payload, or suspicious message. ScamGuard will return an explainable pre-sign risk report in seconds.",
  "",
  "⚡ Commands",
  "• /scan <link|wallet|token|tx>",
  "• /wallet <address>",
  "• /token <mint|contract>",
  "• /tx <transaction payload>",
  "• /report <item>",
  "• /history, /summary, /monthly",
  "• /settings",
  "",
  "👥 Group Guardian",
  "Add the bot to a Telegram group and it will scan posted links. It only replies when the risk crosses the configured alert threshold.",
  "Group admins can use /guardian to manage protection and /guardian connect <code> to link a paid group.",
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
  if (result.riskLevel === "CRITICAL") return "🛑 CRITICAL RISK"
  if (result.riskLevel === "HIGH_RISK") return "⚠️ HIGH RISK"
  if (result.riskLevel === "CAUTION") return "🟡 CAUTION"
  return "🟢 LOW RISK"
}

function strongestSignals(result: ScamGuardScanResult) {
  return result.signals.slice(0, 4).map((signal, index) => {
    const source = sourceFromSignal(signal.detail)
    const reason = source ? signal.detail.replace(source, "this target") : signal.detail
    return [`${index + 1}. ${signal.title}`, source ? `   Source: ${source}` : undefined, `   Reason: ${reason}`]
      .filter((line): line is string => Boolean(line))
      .join("\n")
  })
}

function divider(label: string) {
  const icon = label.includes("summary") ? "📌" : label.includes("evidence") || label.includes("signals") ? "🔎" : label.includes("action") || label.includes("decision") ? "🧭" : label.includes("scanner") ? "↗️" : "•"
  return `\n${icon} [ ${label.toUpperCase()} ]`
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

function transactionIntentLines(result: ScamGuardScanResult) {
  const intent = result.metadata.decodedIntent
  if (!intent || intent.category === "unknown") return []
  const fields = [
    `🧾 Wallet request: ${intent.category}${intent.method ? ` via ${intent.method}` : ""}`,
    intent.recipient ? `→ Recipient: ${intent.recipient}` : undefined,
    intent.spender ? `→ Spender: ${intent.spender}` : undefined,
    intent.amount ? `→ Amount: ${intent.amount}` : undefined,
    intent.assetChange ? `→ Expected change: ${intent.assetChange}` : undefined,
    intent.warnings.length ? `→ Decoder notes: ${intent.warnings.slice(0, 2).join("; ")}` : undefined,
  ]
  return fields.filter((line): line is string => Boolean(line))
}

function sourceFromSignal(detail: string) {
  const domain = detail.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0]
  if (domain) return domain
  const evmAddress = detail.match(/\b0x[a-fA-F0-9]{40}\b/)?.[0]
  if (evmAddress) return evmAddress
  const solanaAddress = detail.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/)?.[0]
  return solanaAddress ?? null
}

function isSeedExposureResult(result: ScamGuardScanResult) {
  return result.signals.some((signal) => signal.code === "SECRET_MATERIAL_REQUEST" || signal.code === "SECRET_MATERIAL_IN_TRANSACTION_PROMPT")
}

function recommendedActions(result: ScamGuardScanResult) {
  return result.actions
    .filter((action) => isSeedExposureResult(result) || !/fresh wallet|seed phrase|private key/i.test(action))
    .slice(0, 3)
}

function isSolanaTokenProgram(ownerProgram?: string | null) {
  return ownerProgram === splTokenProgramId || ownerProgram === token2022ProgramId
}

function isProgramOwnedWalletResult(result: ScamGuardScanResult) {
  return (
    result.type === "wallet" &&
    result.metadata.chain === "solana" &&
    Boolean(result.metadata.ownerProgram) &&
    result.metadata.ownerProgram !== solanaSystemProgramId
  )
}

function accountTypeReportText(result: ScamGuardScanResult, context?: TelegramBotContext) {
  const owner = result.metadata.ownerProgram
  const tokenOwned = isSolanaTokenProgram(owner)
  const title = tokenOwned ? "SPL TOKEN ACCOUNT DETECTED" : "PROGRAM-OWNED ACCOUNT DETECTED"
  const lines = [
    "ScamGuard Report",
    "Pre-sign account classification",
    "==============================",
    "",
    `Result: ${title}`,
    `Target: ${compactTarget(result)}`,
    `Owner program: ${owner ?? "unknown"}`,
    `RPC evidence: ${result.metadata.rpcStatus}`,
    "",
    divider("what this means"),
    tokenOwned
      ? "This address does not look like a normal end-user wallet. It is owned by the Solana SPL Token program, so it is likely a token mint or token account."
      : "This address is not owned by the Solana system program. It appears to be a program-owned account rather than a normal user wallet.",
    "",
    divider("decision"),
    tokenOwned
      ? "Do not judge this as a user wallet. If you expected a token mint, run token analysis. If you expected a user wallet, ask the project to provide the correct wallet address."
      : "Treat this as an account-type mismatch. Verify the project documentation before using it as a destination, wallet, or campaign participant.",
    divider("evidence"),
    `1. Owner program\n   Source: ${owner ?? "unknown"}\n   Reason: Solana RPC reports this owner instead of the system program.`,
    divider("recommended action"),
    tokenOwned ? "- Run /token with this address if it is meant to be a token mint." : "- Verify the account role with official project documentation.",
    "- Do not treat this address as a normal participant wallet.",
    "- Compare the expected account type before signing or sending funds.",
  ]

  const reportUrl = context?.publicBaseUrl ? `${context.publicBaseUrl.replace(/\/$/, "")}/scamguard` : null
  if (reportUrl) lines.push(divider("open full scanner"), reportUrl)

  return lines.join("\n").slice(0, 3900)
}

export function formatTelegramScanReport(result: ScamGuardScanResult, context?: TelegramBotContext) {
  if (isProgramOwnedWalletResult(result)) return accountTypeReportText(result, context)

  const actions = recommendedActions(result)
  const lines = [
    "🛡️ ScamGuard Report",
    "Pre-sign security check",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `Risk: ${statusLine(result)}`,
    `🛡️ Shield score: ${result.score}/100  •  Confidence: ${result.confidence}`,
    `🎯 Target: ${compactTarget(result)}`,
    `🧪 Scan type: ${result.type}`,
    "",
    divider("summary"),
    result.summary,
    "",
    divider("decision"),
    result.explanation,
  ]

  const signals = strongestSignals(result)
  if (signals.length) lines.push(divider("evidence"), ...signals)

  const intent = transactionIntentLines(result)
  if (intent.length) lines.push(divider("wallet request"), ...intent)

  if (actions.length) lines.push(divider("recommended action"), ...actions.map((action) => `- ${action}`))

  const reportUrl = context?.publicBaseUrl ? `${context.publicBaseUrl.replace(/\/$/, "")}/scamguard` : null
  if (reportUrl) lines.push(divider("open full scanner"), reportUrl)

  return lines.join("\n").slice(0, 3900)
}

async function formatTelegramPrivateScanReport(result: ScamGuardScanResult, context?: TelegramBotContext) {
  const report = formatTelegramScanReport(result, context)
  if (isProgramOwnedWalletResult(result)) return report

  const aiReply = await generateScamGuardAiReply(result)
  const lines = [
    report,
    divider(aiReply.source === "gemini" ? "Gemini analyst" : "Evidence analyst"),
    aiReply.source === "gemini" ? `✨ Gemini model: ${aiReply.model}` : "🧠 Deterministic explanation from ScamGuard evidence.",
    `• ${aiReply.headline}`,
    aiReply.explanation,
    ...aiReply.nextSteps.map((action) => `• ${action}`),
  ]
  return lines.join("\n").slice(0, 3900)
}

function groupWarningText(
  result: ScamGuardScanResult,
  campaign?: { occurrenceCount: number; repeatedCampaign: boolean; senderBehavior?: { recentPosts: number; highRiskPosts: number; repeatTargetPosts: number; moderationRecommended: boolean } }
) {
  if (isProgramOwnedWalletResult(result)) return accountTypeReportText(result)

  const signals = strongestSignals(result)
  return [
    "🛡️ ScamGuard Group Guardian",
    "Community link protection",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `Alert: ${statusLine(result)}`,
    `🛡️ Shield score: ${result.score}/100`,
    `🎯 Target: ${compactTarget(result)}`,
    "",
    divider("summary"),
    result.summary,
    signals.length ? divider("strongest signals") : undefined,
    ...signals.slice(0, 3),
    campaign?.repeatedCampaign ? divider("repeated campaign") : undefined,
    campaign?.repeatedCampaign
      ? `The same target appeared ${campaign.occurrenceCount} times in this group during the active detection window. Group admins should review the posting accounts.`
      : undefined,
    campaign?.senderBehavior?.moderationRecommended ? divider("sender behavior") : undefined,
    campaign?.senderBehavior?.moderationRecommended
      ? `This sender posted ${campaign.senderBehavior.highRiskPosts} high-risk item(s) or repeated the same target. An administrator review is recommended.`
      : undefined,
    "",
    "🧭 Action: verify the source from an official channel before connecting a wallet or signing anything.",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")
    .slice(0, 3900)
}

function simpleReply(message: TelegramMessage, text: string, replyMarkup?: TelegramSendMessage["reply_markup"]): TelegramBotAction {
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
      reply_markup: replyMarkup,
    },
  }
}

async function scanCandidate(candidate: ScanCandidate) {
  return scanScamGuard({
    type: candidate.type,
    value: candidate.value,
    chain: candidate.chain,
    sourceUrl: candidate.type === "transaction" ? undefined : candidate.value,
    deepScan: candidate.type === "url",
  })
}

function currentGroupSettings(context: TelegramBotContext) {
  return (
    context.groupSettings ?? {
      guardianEnabled: true,
      allowlisted: true,
      alertLevel: context.groupAlertLevel ?? "HIGH_RISK",
      dailySummary: true,
    }
  )
}

function guardianStatusText(context: TelegramBotContext) {
  const settings = currentGroupSettings(context)
  return [
    "🛡️ ScamGuard Group Guardian",
    "Protection controls",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `🛡️ Protection: ${settings.guardianEnabled ? "ON" : "OFF"}`,
    `✅ Group approval: ${settings.allowlisted ? "APPROVED" : "NOT APPROVED"}`,
    `⚠️ Alert threshold: ${settings.alertLevel}`,
    `📅 Daily summary: ${settings.dailySummary ? "ON" : "OFF"}`,
    `✨ Gemini analyst: ${context.geminiConfigured ? "CONFIGURED" : "EVIDENCE FALLBACK"}`,
    "",
    "[ ADMIN COMMANDS ]",
    "/guardian on",
    "/guardian off",
    "/guardian threshold caution",
    "/guardian threshold high",
    "/guardian threshold critical",
    "/guardian summary on",
    "/guardian summary off",
    "",
    "Use /history for recent scans and /summary for the last 24 hours.",
  ].join("\n")
}

function historyText(
  history: Awaited<ReturnType<NonNullable<TelegramBotContext["loadHistory"]>>>
) {
  if (!history.length) {
    return "🕘 SCAMGUARD SCAN HISTORY\n━━━━━━━━━━━━━━━━━━━━\n\nNo scans have been recorded for this chat yet."
  }

  return [
    "🕘 SCAMGUARD SCAN HISTORY",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    ...history.map((item, index) => {
      const target = item.domain ?? item.target
      const time = item.createdAt.toISOString().replace("T", " ").slice(0, 16)
      return `${index + 1}. ${item.riskLevel} | ${item.score}/100\n   ${target}\n   ${time} UTC`
    }),
  ]
    .join("\n")
    .slice(0, 3900)
}

export function formatGuardianSummary(summary: {
  hours: number
  total: number
  alerts: number
  critical: number
  repeated: number
}) {
  return [
    "📊 ScamGuard Guardian Summary",
    `${summary.hours}-hour community protection report`,
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `🔎 Links and items scanned: ${summary.total}`,
    `⚠️ Security alerts issued: ${summary.alerts}`,
    `🛑 Critical detections: ${summary.critical}`,
    `🔁 Repeated campaigns: ${summary.repeated}`,
    "",
    summary.alerts === 0
      ? "No alert-level threat crossed this group's configured threshold."
      : "Review alert messages and remove repeated malicious links or posting accounts.",
  ].join("\n")
}

async function isVerifiedGroupAdmin(message: TelegramMessage, context: TelegramBotContext) {
  if (!message.from?.id || !context.isGroupAdmin) return false
  return context.isGroupAdmin(message.chat.id, message.from.id)
}

async function handleGuardianCommand(message: TelegramMessage, args: string, context: TelegramBotContext) {
  const normalized = args.trim().toLowerCase()
  if (!normalized || normalized === "status") {
    return [simpleReply(message, guardianStatusText(context))]
  }

  const allowed = await isVerifiedGroupAdmin(message, context)
  if (!allowed) {
    return [simpleReply(message, "Only a verified Telegram group administrator can change Group Guardian settings.")]
  }
  if (normalized.startsWith("connect ")) {
    if (!context.claimGroup) return [simpleReply(message, "Group connection is temporarily unavailable. Please try again shortly.")]
    const connected = await context.claimGroup(message.chat.id, normalized.slice("connect ".length).trim())
    return [simpleReply(message, connected.ok ? `GROUP GUARDIAN CONNECTED\n\n${connected.title ?? "This group"} is now protected under the ${connected.plan ?? "Community"} plan.` : connected.reason ?? "This group could not be connected.")]
  }
  if (context.authorizeGroupManager && message.from?.id && !(await context.authorizeGroupManager(message.chat.id, message.from.id))) {
    return [simpleReply(message, "This plan allows a limited number of Group Guardian administrators. Ask the workspace owner to manage administrator slots.")]
  }
  if (!context.updateGroupSettings) {
    return [simpleReply(message, "Group settings storage is temporarily unavailable. Please try again shortly.")]
  }

  let values:
    | {
        guardianEnabled?: boolean
        alertLevel?: "CAUTION" | "HIGH_RISK" | "CRITICAL"
        dailySummary?: boolean
      }
    | null = null

  if (normalized === "on") values = { guardianEnabled: true }
  if (normalized === "off") values = { guardianEnabled: false }
  if (normalized === "summary on") values = { dailySummary: true }
  if (normalized === "summary off") values = { dailySummary: false }
  if (normalized === "threshold caution") values = { alertLevel: "CAUTION" }
  if (normalized === "threshold high" || normalized === "threshold high_risk") values = { alertLevel: "HIGH_RISK" }
  if (normalized === "threshold critical") values = { alertLevel: "CRITICAL" }

  if (!values) {
    return [simpleReply(message, `Unknown Guardian setting.\n\n${guardianStatusText(context)}`)]
  }

  const updated = await context.updateGroupSettings(message.chat.id, values)
  return [
    simpleReply(
      message,
      [
        "GROUP GUARDIAN UPDATED",
        "======================",
        "",
        `Protection: ${updated.guardianEnabled ? "ON" : "OFF"}`,
        `Alert threshold: ${updated.alertLevel}`,
        `Daily summary: ${updated.dailySummary ? "ON" : "OFF"}`,
      ].join("\n")
    ),
  ]
}

async function recordScanSafely(
  context: TelegramBotContext,
  input: Parameters<NonNullable<TelegramBotContext["recordScan"]>>[0]
) {
  if (!context.recordScan) return { occurrenceCount: 1, repeatedCampaign: false }
  try {
    return await context.recordScan(input)
  } catch {
    return { occurrenceCount: 1, repeatedCampaign: false }
  }
}

async function handlePrivateOrCommand(message: TelegramMessage, context: TelegramBotContext) {
  const text = textOf(message).trim()
  const command = parseCommand(text)

  if (command?.name === "start" || command?.name === "help") {
    return [simpleReply(message, commandHelp)]
  }

  if (command?.name === "settings") {
    if (message.chat.type === "group" || message.chat.type === "supergroup") {
      return [simpleReply(message, guardianStatusText(context))]
    }
    return [
      simpleReply(
        message,
        [
          "⚙️ SCAMGUARD SETTINGS",
          "━━━━━━━━━━━━━━━━━━━━",
          "",
          `⚠️ Group alert threshold: ${context.groupAlertLevel ?? "HIGH_RISK"}`,
          `✨ Gemini analyst: ${context.geminiConfigured ? "CONFIGURED" : "EVIDENCE FALLBACK"}`,
          "Data policy: the bot never asks for seed phrases, private keys, wallet passwords, or custody permissions.",
          "History: recent scans can be viewed with /history.",
        ].join("\n")
      ),
    ]
  }

  if (command?.name === "guardian") {
    if (message.chat.type !== "group" && message.chat.type !== "supergroup") {
      return [simpleReply(message, "Add ScamGuard to a Telegram group, then use /guardian there to manage Group Guardian.")]
    }
    return handleGuardianCommand(message, command.args, context)
  }

  if (command?.name === "history") {
    if (!context.loadHistory) return [simpleReply(message, "Scan history is temporarily unavailable.")]
    return [simpleReply(message, historyText(await context.loadHistory(message.chat.id, 6)))]
  }

  if (command?.name === "summary") {
    if (!context.loadSummary) return [simpleReply(message, "Guardian summary is temporarily unavailable.")]
    return [simpleReply(message, formatGuardianSummary(await context.loadSummary(message.chat.id, 24)))]
  }

  if (command?.name === "monthly") {
    if (!context.loadSummary) return [simpleReply(message, "Guardian summary is temporarily unavailable.")]
    return [simpleReply(message, formatGuardianSummary(await context.loadSummary(message.chat.id, 24 * 30)))]
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
  await recordScanSafely(context, {
    message,
    candidate,
    result,
    source:
      message.chat.type === "group" || message.chat.type === "supergroup"
        ? "GROUP_GUARDIAN"
        : "PRIVATE_COMMAND",
    alerted: false,
  })
  return [simpleReply(message, await formatTelegramPrivateScanReport(result, context))]
}

async function handleGroupGuardian(message: TelegramMessage, context: TelegramBotContext) {
  const command = parseCommand(textOf(message))
  if (command) return handlePrivateOrCommand(message, context)

  const settings = currentGroupSettings(context)
  if (!settings.guardianEnabled || !settings.allowlisted) return []

  const threshold = settings.alertLevel
  const urls = urlEntities(message).slice(0, 5)
  const actions: TelegramBotAction[] = []

  for (const url of urls) {
    const candidate: ScanCandidate = { type: "url", value: url, chain: "unknown" }
    const result = await scanCandidate(candidate)
    const policy = context.applyTeamPolicy ? await context.applyTeamPolicy({ candidate, result, chatId: message.chat.id }) : { action: TeamPolicyAction.ALLOW, matched: [] }
    const alerted = policy.action !== TeamPolicyAction.ALLOW || levelMeetsThreshold(result.riskLevel, threshold)
    const campaign = await recordScanSafely(context, {
      message,
      candidate,
      result,
      source: "GROUP_GUARDIAN",
      alerted,
    })
    if (alerted) {
      const canOfferMute = Boolean(campaign.eventId && campaign.senderBehavior?.moderationRecommended && message.from?.id)
      const policyNotice = policy.action === TeamPolicyAction.ALLOW ? "" : `\n\nTEAM POLICY: ${policy.action}\n${policy.matched.slice(0, 2).map((item) => `${item.policyName}: ${item.reason}`).join("\n")}`
      actions.push(simpleReply(message, `${groupWarningText(result, campaign)}${policyNotice}`, canOfferMute ? {
        inline_keyboard: [[
          { text: "Mute sender for 1 hour", callback_data: `sg_mute:${campaign.eventId}` },
          { text: "Open scanner", url: `${context.publicBaseUrl?.replace(/\/$/, "") ?? "https://triproofprotocol.com"}/scamguard` },
        ]],
      } : undefined))
    }
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
