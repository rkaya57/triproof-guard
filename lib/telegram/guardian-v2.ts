import { TeamPolicyAction } from "@prisma/client"

import {
  scanScamGuard,
  type ScamGuardChain,
  type ScamGuardRiskLevel,
  type ScamGuardScanResult,
  type ScamGuardScanType,
} from "@/lib/scamguard/engine"
import {
  type AdvancedTelegramGroupSettings,
  type AdvancedTelegramGroupUpdate,
  type TelegramModerationAction,
} from "@/lib/telegram/advanced-store"
import type {
  TelegramBotAction,
  TelegramBotContext as BaseTelegramBotContext,
  TelegramMessage,
  TelegramSendMessage,
} from "@/lib/telegram/bot"
import {
  applyProjectRegistryAssessment,
  assessProjectImpersonation,
  loadActiveTelegramProjectRegistry,
  type RegistryCandidate,
} from "@/lib/telegram/project-registry"

export type TelegramBotPermissionSnapshot = {
  botId: number
  username: string | null
  status: string
  canReadMessages: boolean
  canDeleteMessages: boolean
  canRestrictMembers: boolean
  canManageChat: boolean
  checkedAt: string
}

export type AdvancedTelegramBotContext = Omit<
  BaseTelegramBotContext,
  "groupSettings" | "consumeScanAllowance" | "updateGroupSettings"
> & {
  groupSettings?: AdvancedTelegramGroupSettings
  consumePersistentAllowance?: (input: {
    chatId: number
    userId?: number
    group: boolean
  }) => Promise<{ allowed: boolean; retryAfterSeconds: number }>
  updateAdvancedGroupSettings?: (
    chatId: number,
    values: AdvancedTelegramGroupUpdate
  ) => Promise<AdvancedTelegramGroupSettings | null>
  deleteMessage?: (chatId: number, messageId: number) => Promise<boolean>
  getBotPermissions?: (chatId: number) => Promise<TelegramBotPermissionSnapshot>
  savePermissionSnapshot?: (
    chatId: number,
    snapshot: TelegramBotPermissionSnapshot
  ) => Promise<void>
}

type AdvancedScanCandidate = RegistryCandidate & {
  chain: ScamGuardChain
  source: "url" | "address" | "transaction" | "secret"
}

type CandidateResult = {
  candidate: AdvancedScanCandidate
  result: ScamGuardScanResult
  policy: {
    action: TeamPolicyAction
    matched: Array<{ policyName: string; reason: string }>
  }
  alerted: boolean
  eventId?: string
  occurrenceCount: number
  repeatedCampaign: boolean
  moderationRecommended: boolean
}

const urlRegex = /\bhttps?:\/\/[^\s<>"')\]]+/gi
const evmAddressRegex = /\b0x[a-fA-F0-9]{40}\b/g
const solanaAddressRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g
const base64PayloadRegex = /\b[A-Za-z0-9+/_=-]{80,2000}\b/g
const transactionIntentRegex = /\b(?:setApprovalForAll|personal_sign|eth_sign|eth_sendTransaction|approve\s*\(|delegate\s*\(|setAuthority|closeAccount|approveChecked)\b/i
const secretRequestRegex = /\b(seed phrase|recovery phrase|secret phrase|private key|mnemonic)\b/i
const knownSolanaPrograms = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN",
])

const riskRank: Record<ScamGuardRiskLevel, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
}

function textOf(message: TelegramMessage) {
  return message.text ?? message.caption ?? ""
}

function parseCommand(text: string) {
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]+))?$/)
  if (!match) return null
  return { name: match[1].toLowerCase(), args: match[2]?.trim() ?? "" }
}

function cleanUrl(value: string) {
  return value.trim().replace(/[.,!?;:]+$/, "")
}

function urlEntities(message: TelegramMessage) {
  const sourceText = textOf(message)
  const entities = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
  const urls = new Set<string>()
  for (const entity of entities) {
    if (entity.type === "text_link" && entity.url) urls.add(entity.url)
    if (entity.type === "url") urls.add(sourceText.slice(entity.offset, entity.offset + entity.length))
  }
  for (const match of sourceText.matchAll(urlRegex)) urls.add(match[0])
  return [...urls].map(cleanUrl).filter((value) => /^https?:\/\//i.test(value))
}

function contextWindow(text: string, index: number, length: number) {
  return text.slice(Math.max(0, index - 40), Math.min(text.length, index + length + 40)).toLowerCase()
}

function addressType(text: string, index: number, length: number, chain: "evm" | "solana") {
  const context = contextWindow(text, index, length)
  const tokenLanguage = /\b(?:token|mint|ticker|coin|ca|contract address)\b/i.test(context)
  const contractLanguage = /\b(?:contract|smart contract|spender)\b/i.test(context)
  if (chain === "evm" && contractLanguage) return "contract" as const
  if (tokenLanguage) return "token" as const
  return "wallet" as const
}

function candidateKey(candidate: AdvancedScanCandidate) {
  return `${candidate.type}:${candidate.chain}:${candidate.value.trim().toLowerCase()}`
}

export function extractAdvancedScanCandidates(message: TelegramMessage) {
  const text = textOf(message)
  const candidates = new Map<string, AdvancedScanCandidate>()

  for (const url of urlEntities(message)) {
    const candidate: AdvancedScanCandidate = {
      type: "url",
      value: url,
      chain: "unknown",
      source: "url",
    }
    candidates.set(candidateKey(candidate), candidate)
  }

  for (const match of text.matchAll(evmAddressRegex)) {
    const value = match[0]
    const candidate: AdvancedScanCandidate = {
      type: addressType(text, match.index ?? 0, value.length, "evm"),
      value,
      chain: "evm",
      source: "address",
    }
    candidates.set(candidateKey(candidate), candidate)
  }

  for (const match of text.matchAll(solanaAddressRegex)) {
    const value = match[0]
    if (knownSolanaPrograms.has(value)) continue
    const candidate: AdvancedScanCandidate = {
      type: addressType(text, match.index ?? 0, value.length, "solana"),
      value,
      chain: "solana",
      source: "address",
    }
    candidates.set(candidateKey(candidate), candidate)
  }

  const transactionPayload = text.match(base64PayloadRegex)?.find((value) => value.length >= 100)
  if (transactionPayload || transactionIntentRegex.test(text)) {
    const value = transactionPayload ?? text.trim().slice(0, 2000)
    const chain: ScamGuardChain = /eth_|personal_sign|setApprovalForAll|0x[a-fA-F0-9]{8,}/i.test(text)
      ? "evm"
      : /solana|approveChecked|setAuthority|closeAccount/i.test(text)
        ? "solana"
        : "unknown"
    const candidate: AdvancedScanCandidate = {
      type: "transaction",
      value,
      chain,
      source: "transaction",
    }
    candidates.set(candidateKey(candidate), candidate)
  }

  if (secretRequestRegex.test(text)) {
    const candidate: AdvancedScanCandidate = {
      type: "transaction",
      value: "Secret wallet material request detected in Telegram message",
      chain: "unknown",
      source: "secret",
    }
    candidates.set(candidateKey(candidate), candidate)
  }

  return [...candidates.values()].slice(0, 8)
}

function secretMaterialResult(): ScamGuardScanResult {
  return {
    id: "telegram-secret-material-request-v2",
    type: "transaction",
    score: 98,
    riskLevel: "CRITICAL",
    summary: "This message appears to request secret wallet material.",
    confidence: "HIGH",
    explanation: "Recovery phrases, private keys, and mnemonics provide full wallet control and must never be shared in Telegram.",
    signals: [
      {
        code: "SECRET_MATERIAL_REQUEST",
        severity: "critical",
        title: "Secret wallet material request",
        detail: "The message contains non-negated language requesting a recovery phrase, private key, or mnemonic.",
      },
    ],
    actions: [
      "Do not share any wallet secret.",
      "Delete the message and review the sender.",
      "Move funds immediately if a secret was already exposed.",
    ],
    metadata: {
      chain: "unknown",
      rpcStatus: "not_applicable",
      decodedIntent: { category: "unknown", warnings: [] },
    },
    scannedAt: new Date().toISOString(),
  }
}

function incompleteScanResult(candidate: AdvancedScanCandidate, error: unknown): ScamGuardScanResult {
  const message = error instanceof Error ? error.message : "Unknown scanner error"
  return {
    id: `telegram-incomplete-${Date.now()}`,
    type: candidate.type,
    score: 35,
    riskLevel: "CAUTION",
    summary: "ScamGuard could not complete every verification step for this target.",
    confidence: "LOW",
    explanation: `The scan provider returned an operational error: ${message.slice(0, 300)}`,
    signals: [
      {
        code: "SCAN_PROVIDER_INCOMPLETE",
        severity: "low",
        title: "Incomplete verification",
        detail: "The target should be retried before a wallet is connected or a transaction is signed.",
      },
    ],
    actions: ["Retry the scan before interacting with this target."],
    metadata: {
      chain: candidate.chain,
      rpcStatus: "failed",
      decodedIntent: { category: "unknown", warnings: [] },
    },
    scannedAt: new Date().toISOString(),
  }
}

async function scanCandidate(
  candidate: AdvancedScanCandidate,
  messageText: string,
  registry: Awaited<ReturnType<typeof loadActiveTelegramProjectRegistry>>
) {
  if (candidate.source === "secret") return secretMaterialResult()
  try {
    const result = await scanScamGuard({
      type: candidate.type,
      value: candidate.value,
      chain: candidate.chain,
      sourceUrl: candidate.type === "transaction" ? undefined : candidate.value,
      deepScan: candidate.type === "url",
    })
    const assessment = assessProjectImpersonation(registry, candidate, messageText)
    return applyProjectRegistryAssessment(result, assessment)
  } catch (error) {
    return incompleteScanResult(candidate, error)
  }
}

function currentSettings(context: AdvancedTelegramBotContext): AdvancedTelegramGroupSettings {
  return (
    context.groupSettings ?? {
      id: "unlinked",
      telegramChatId: "",
      title: null,
      username: null,
      guardianEnabled: true,
      allowlisted: true,
      alertLevel: "HIGH_RISK",
      dailySummary: true,
      autoMuteCritical: false,
      safeMode: "SILENT",
      highRiskAction: "ADMIN_REVIEW",
      criticalAction: "ADMIN_REVIEW",
      permissionSnapshot: null,
      lastPermissionCheckAt: null,
    }
  )
}

function baseUrl(context: AdvancedTelegramBotContext) {
  return context.publicBaseUrl?.replace(/\/$/, "") ?? "https://triproofprotocol.com"
}

function targetLabel(candidate: AdvancedScanCandidate, result: ScamGuardScanResult) {
  return (
    result.metadata.domain ??
    result.metadata.walletAddress ??
    result.metadata.contractIntelligence?.target ??
    candidate.value
  ).slice(0, 90)
}

function statusIcon(level: ScamGuardRiskLevel) {
  if (level === "CRITICAL") return "🛑"
  if (level === "HIGH_RISK") return "⚠️"
  if (level === "CAUTION") return "🟡"
  return "🟢"
}

function simpleReply(
  message: TelegramMessage,
  text: string,
  replyMarkup?: TelegramSendMessage["reply_markup"],
  replyToMessage = true
): TelegramBotAction {
  return {
    method: "sendMessage",
    payload: {
      chat_id: message.chat.id,
      text: text.slice(0, 3900),
      reply_parameters: replyToMessage
        ? { message_id: message.message_id, allow_sending_without_reply: true }
        : undefined,
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    },
  }
}

function rateLimitAction(message: TelegramMessage, seconds: number) {
  return simpleReply(
    message,
    `ScamGuard scan limit reached. Please wait about ${Math.max(1, Math.ceil(seconds / 60))} minute(s) and try again.`
  )
}

async function isVerifiedAdmin(message: TelegramMessage, context: AdvancedTelegramBotContext) {
  if (!message.from?.id || !context.isGroupAdmin) return false
  try {
    return await context.isGroupAdmin(message.chat.id, message.from.id)
  } catch {
    return false
  }
}

function actionLabel(action: TelegramModerationAction) {
  if (action === "WARN_ONLY") return "Warn only"
  if (action === "ADMIN_REVIEW") return "Admin review"
  if (action === "DELETE") return "Delete message"
  if (action === "DELETE_MUTE_1H") return "Delete + mute 1h"
  return "Delete + mute 24h"
}

function guardianStatusText(context: AdvancedTelegramBotContext) {
  const settings = currentSettings(context)
  return [
    "🛡️ ScamGuard Group Guardian",
    "Advanced protection controls",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `Protection: ${settings.guardianEnabled ? "ON" : "OFF"}`,
    `Group approval: ${settings.allowlisted ? "APPROVED" : "NOT APPROVED"}`,
    `Alert threshold: ${settings.alertLevel}`,
    `SAFE result mode: ${settings.safeMode}`,
    `High-risk action: ${actionLabel(settings.highRiskAction)}`,
    `Critical action: ${actionLabel(settings.criticalAction)}`,
    `Daily summary: ${settings.dailySummary ? "ON" : "OFF"}`,
    "",
    "Admin commands:",
    "/guardian on | off",
    "/guardian threshold caution | high | critical",
    "/guardian safe silent | compact | full",
    "/guardian high warn | review | delete | mute1h | mute24h",
    "/guardian critical warn | review | delete | mute1h | mute24h",
    "/guardian summary on | off",
    "/guardian permissions",
  ].join("\n")
}

function moderationValue(value: string): TelegramModerationAction | null {
  if (value === "warn") return "WARN_ONLY"
  if (value === "review") return "ADMIN_REVIEW"
  if (value === "delete") return "DELETE"
  if (value === "mute1h") return "DELETE_MUTE_1H"
  if (value === "mute24h") return "DELETE_MUTE_24H"
  return null
}

async function handleGuardianCommand(
  message: TelegramMessage,
  args: string,
  context: AdvancedTelegramBotContext
) {
  const normalized = args.trim().toLowerCase()
  if (!normalized || normalized === "status") return [simpleReply(message, guardianStatusText(context))]

  const admin = await isVerifiedAdmin(message, context)
  if (!admin) {
    return [simpleReply(message, "Only a verified Telegram group administrator can change Group Guardian settings.")]
  }

  if (normalized.startsWith("connect ")) {
    if (!context.claimGroup) return [simpleReply(message, "Group connection is temporarily unavailable.")]
    const connected = await context.claimGroup(message.chat.id, normalized.slice("connect ".length).trim())
    return [
      simpleReply(
        message,
        connected.ok
          ? `GROUP GUARDIAN CONNECTED\n\n${connected.title ?? "This group"} is now protected under the ${connected.plan ?? "Community"} plan.`
          : connected.reason ?? "This group could not be connected."
      ),
    ]
  }

  if (normalized === "permissions") {
    if (!context.getBotPermissions) return [simpleReply(message, "Permission diagnostics are temporarily unavailable.")]
    try {
      const permissions = await context.getBotPermissions(message.chat.id)
      await context.savePermissionSnapshot?.(message.chat.id, permissions)
      return [
        simpleReply(
          message,
          [
            "🧪 GROUP GUARDIAN PERMISSION TEST",
            "━━━━━━━━━━━━━━━━━━━━",
            "",
            `Bot: @${permissions.username ?? "unknown"}`,
            `Telegram status: ${permissions.status}`,
            `Read messages: ${permissions.canReadMessages ? "OK" : "MISSING"}`,
            `Delete messages: ${permissions.canDeleteMessages ? "OK" : "MISSING"}`,
            `Restrict members: ${permissions.canRestrictMembers ? "OK" : "MISSING"}`,
            `Manage chat: ${permissions.canManageChat ? "OK" : "MISSING"}`,
            "",
            permissions.canDeleteMessages && permissions.canRestrictMembers
              ? "Automatic quarantine policies can operate in this group."
              : "Grant the bot administrator permissions before enabling delete or mute policies.",
          ].join("\n")
        ),
      ]
    } catch (error) {
      return [simpleReply(message, `Permission test failed: ${error instanceof Error ? error.message : "Unknown error"}`)]
    }
  }

  if (!context.updateAdvancedGroupSettings) {
    return [simpleReply(message, "Group settings storage is temporarily unavailable.")]
  }

  let values: AdvancedTelegramGroupUpdate | null = null
  if (normalized === "on") values = { guardianEnabled: true }
  if (normalized === "off") values = { guardianEnabled: false }
  if (normalized === "summary on") values = { dailySummary: true }
  if (normalized === "summary off") values = { dailySummary: false }
  if (normalized === "threshold caution") values = { alertLevel: "CAUTION" }
  if (normalized === "threshold high" || normalized === "threshold high_risk") values = { alertLevel: "HIGH_RISK" }
  if (normalized === "threshold critical") values = { alertLevel: "CRITICAL" }
  if (normalized === "safe silent") values = { safeMode: "SILENT" }
  if (normalized === "safe compact") values = { safeMode: "COMPACT" }
  if (normalized === "safe full") values = { safeMode: "FULL" }
  if (normalized === "automute on") values = { autoMuteCritical: true, criticalAction: "DELETE_MUTE_1H" }
  if (normalized === "automute off") values = { autoMuteCritical: false, criticalAction: "ADMIN_REVIEW" }
  if (normalized.startsWith("high ")) {
    const action = moderationValue(normalized.slice("high ".length))
    if (action) values = { highRiskAction: action }
  }
  if (normalized.startsWith("critical ")) {
    const action = moderationValue(normalized.slice("critical ".length))
    if (action) values = { criticalAction: action, autoMuteCritical: action === "DELETE_MUTE_1H" || action === "DELETE_MUTE_24H" }
  }

  if (!values) return [simpleReply(message, `Unknown Guardian setting.\n\n${guardianStatusText(context)}`)]
  const updated = await context.updateAdvancedGroupSettings(message.chat.id, values)
  return [
    simpleReply(
      message,
      updated
        ? [
            "GROUP GUARDIAN UPDATED",
            "━━━━━━━━━━━━━━━━━━━━",
            `Protection: ${updated.guardianEnabled ? "ON" : "OFF"}`,
            `Threshold: ${updated.alertLevel}`,
            `SAFE mode: ${updated.safeMode}`,
            `High-risk action: ${actionLabel(updated.highRiskAction)}`,
            `Critical action: ${actionLabel(updated.criticalAction)}`,
          ].join("\n")
        : "Group settings could not be updated."
    ),
  ]
}

export function resolveModerationAction(input: {
  level: ScamGuardRiskLevel
  policyBlocked: boolean
  settings: Pick<AdvancedTelegramGroupSettings, "highRiskAction" | "criticalAction" | "autoMuteCritical">
}) {
  if (input.policyBlocked || input.level === "CRITICAL") {
    if (input.settings.autoMuteCritical && input.settings.criticalAction === "ADMIN_REVIEW") {
      return "DELETE_MUTE_1H" as TelegramModerationAction
    }
    return input.settings.criticalAction
  }
  if (input.level === "HIGH_RISK") return input.settings.highRiskAction
  return "WARN_ONLY" as TelegramModerationAction
}

async function applyAutomaticModeration(
  message: TelegramMessage,
  action: TelegramModerationAction,
  context: AdvancedTelegramBotContext
) {
  if (action === "WARN_ONLY" || action === "ADMIN_REVIEW") {
    return { deleted: false, muted: false, note: "" }
  }
  if (await isVerifiedAdmin(message, context)) {
    return { deleted: false, muted: false, note: "Automatic moderation skipped because the sender is a group administrator." }
  }

  let deleted = false
  let muted = false
  const errors: string[] = []
  if (context.deleteMessage) {
    try {
      deleted = await context.deleteMessage(message.chat.id, message.message_id)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Message deletion failed")
    }
  } else {
    errors.push("Message deletion is unavailable")
  }

  if (action === "DELETE_MUTE_1H" || action === "DELETE_MUTE_24H") {
    if (!message.from?.id || !context.muteMember) {
      errors.push("Member restriction is unavailable")
    } else {
      try {
        muted = await context.muteMember(
          message.chat.id,
          message.from.id,
          action === "DELETE_MUTE_24H" ? 24 * 60 * 60 : 60 * 60
        )
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Member restriction failed")
      }
    }
  }

  const completed = [deleted ? "message deleted" : null, muted ? "sender muted" : null].filter(Boolean).join(" and ")
  return {
    deleted,
    muted,
    note: errors.length
      ? `Quarantine was only partially applied: ${errors.join("; ")}.`
      : completed
        ? `Automatic quarantine applied: ${completed}.`
        : "",
  }
}

function combinedKeyboard(
  context: AdvancedTelegramBotContext,
  dangerousEventId?: string,
  offerModeration = false
): TelegramSendMessage["reply_markup"] {
  const rows: NonNullable<TelegramSendMessage["reply_markup"]>["inline_keyboard"] = []
  if (dangerousEventId && offerModeration) {
    rows.push([
      { text: "Delete message", callback_data: `sg_delete:${dangerousEventId}` },
      { text: "Mute 1 hour", callback_data: `sg_mute:${dangerousEventId}:1` },
      { text: "Mute 24 hours", callback_data: `sg_mute:${dangerousEventId}:24` },
    ])
  }
  rows.push([
    { text: "Open full scanner", url: `${baseUrl(context)}/scamguard` },
    { text: "Threat Pool", url: `${baseUrl(context)}/threat-reports` },
  ])
  return { inline_keyboard: rows }
}

function compactSafeReport(results: CandidateResult[]) {
  return [
    "🟢 SCAMGUARD GROUP SCAN",
    `${results.length} target${results.length === 1 ? "" : "s"} checked · no elevated risk detected`,
    "",
    ...results.slice(0, 5).map(({ candidate, result }) => `• ${targetLabel(candidate, result)} — ${result.score}/100`),
    "",
    "Always inspect the exact wallet prompt before signing.",
  ].join("\n")
}

function combinedReport(results: CandidateResult[], moderationNote: string) {
  const highest = results.reduce((current, item) =>
    riskRank[item.result.riskLevel] > riskRank[current.result.riskLevel] ? item : current
  )
  const alertCount = results.filter((item) => item.alerted).length
  const lines = [
    "🛡️ SCAMGUARD GROUP GUARDIAN",
    "Multi-target security report",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `${statusIcon(highest.result.riskLevel)} Highest status: ${highest.result.riskLevel.replace("_", " ")} · ${highest.result.score}/100`,
    `Targets checked: ${results.length} · Alert-level results: ${alertCount}`,
    moderationNote ? `Moderation: ${moderationNote}` : undefined,
    "",
  ]

  for (const [index, item] of results.entries()) {
    const strongest = item.result.signals[0]
    lines.push(
      `${index + 1}. ${statusIcon(item.result.riskLevel)} ${targetLabel(item.candidate, item.result)}`,
      `   ${item.result.riskLevel.replace("_", " ")} · ${item.result.score}/100 · ${item.result.confidence} confidence`,
      `   ${item.result.summary}`,
      strongest ? `   Signal: ${strongest.title}` : "",
      item.repeatedCampaign ? `   Repeated campaign: ${item.occurrenceCount} appearances` : ""
    )
  }

  lines.push("", "Action: verify the project from an official registry asset before connecting a wallet or signing.")
  return lines.filter((line): line is string => Boolean(line)).join("\n").slice(0, 3900)
}

async function recordResult(
  message: TelegramMessage,
  candidate: AdvancedScanCandidate,
  result: ScamGuardScanResult,
  alerted: boolean,
  context: AdvancedTelegramBotContext
) {
  if (!context.recordScan) {
    return { occurrenceCount: 1, repeatedCampaign: false, moderationRecommended: false, eventId: undefined }
  }
  try {
    const recorded = await context.recordScan({
      message,
      candidate,
      result,
      source: "GROUP_GUARDIAN",
      alerted,
    })
    return {
      eventId: recorded.eventId,
      occurrenceCount: recorded.occurrenceCount,
      repeatedCampaign: recorded.repeatedCampaign,
      moderationRecommended: Boolean(recorded.senderBehavior?.moderationRecommended),
    }
  } catch {
    return { occurrenceCount: 1, repeatedCampaign: false, moderationRecommended: false, eventId: undefined }
  }
}

async function scanGroupMessage(message: TelegramMessage, context: AdvancedTelegramBotContext) {
  const settings = currentSettings(context)
  const candidates = extractAdvancedScanCandidates(message)
  if (!candidates.length) return []

  if (!settings.guardianEnabled || !settings.allowlisted) {
    return [
      simpleReply(
        message,
        settings.guardianEnabled
          ? "Group Guardian is not approved for this group yet. Connect it from the Tri-Proof dashboard before automatic scanning."
          : "Group Guardian is paused. A group administrator can restore it with /guardian on."
      ),
    ]
  }

  const allowance = await context.consumePersistentAllowance?.({
    chatId: message.chat.id,
    userId: message.from?.id,
    group: true,
  })
  if (allowance && !allowance.allowed) return [rateLimitAction(message, allowance.retryAfterSeconds)]

  const registry = await loadActiveTelegramProjectRegistry().catch(() => [])
  const results: CandidateResult[] = []
  for (const candidate of candidates) {
    const result = await scanCandidate(candidate, textOf(message), registry)
    const policy = context.applyTeamPolicy
      ? await context.applyTeamPolicy({ candidate, result, chatId: message.chat.id })
      : { action: TeamPolicyAction.ALLOW, matched: [] }
    const alerted = policy.action !== TeamPolicyAction.ALLOW || riskRank[result.riskLevel] >= riskRank[settings.alertLevel]
    const recorded = await recordResult(message, candidate, result, alerted, context)
    results.push({ candidate, result, policy, alerted, ...recorded })
  }

  const highest = results.reduce((current, item) =>
    riskRank[item.result.riskLevel] > riskRank[current.result.riskLevel] ? item : current
  )
  const policyBlocked = results.some((item) => item.policy.action === TeamPolicyAction.BLOCK)
  const action = resolveModerationAction({ level: highest.result.riskLevel, policyBlocked, settings })
  const moderation = await applyAutomaticModeration(message, action, context)

  const allSafe = results.every((item) => item.result.riskLevel === "SAFE")
  if (allSafe && settings.safeMode === "SILENT") return []
  if (allSafe && settings.safeMode === "COMPACT") {
    return [simpleReply(message, compactSafeReport(results), combinedKeyboard(context), !moderation.deleted)]
  }

  const dangerous = results.find((item) => item.alerted && ["HIGH_RISK", "CRITICAL"].includes(item.result.riskLevel))
    ?? results.find((item) => item.alerted)
  const offerModeration = action === "ADMIN_REVIEW" || action === "WARN_ONLY" || !moderation.deleted
  return [
    simpleReply(
      message,
      combinedReport(results, moderation.note),
      combinedKeyboard(context, dangerous?.eventId, offerModeration),
      !moderation.deleted
    ),
  ]
}

export async function handleAdvancedGroupUpdate(
  message: TelegramMessage,
  context: AdvancedTelegramBotContext
): Promise<TelegramBotAction[] | null> {
  const command = parseCommand(textOf(message))
  if (command?.name === "guardian") return handleGuardianCommand(message, command.args, context)
  if (command) return null
  return scanGroupMessage(message, context)
}
