import { TeamPolicyAction } from "@prisma/client"

import {
  scanScamGuard,
  type ScamGuardChain,
  type ScamGuardRiskLevel,
  type ScamGuardScanResult,
  type ScamGuardScanType,
} from "@/lib/scamguard/engine"
import type {
  AdvancedTelegramGroupSettings,
  AdvancedTelegramGroupUpdate,
  TelegramModerationAction,
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
  savePermissionSnapshot?: (chatId: number, snapshot: TelegramBotPermissionSnapshot) => Promise<void>
}

type CandidateSource = "url" | "address" | "transaction" | "secret"
type AdvancedScanCandidate = RegistryCandidate & { chain: ScamGuardChain; source: CandidateSource }
type CandidateResult = {
  candidate: AdvancedScanCandidate
  result: ScamGuardScanResult
  policy: { action: TeamPolicyAction; matched: Array<{ policyName: string; reason: string }> }
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
const riskRank: Record<ScamGuardRiskLevel, number> = { SAFE: 0, CAUTION: 1, HIGH_RISK: 2, CRITICAL: 3 }

function textOf(message: TelegramMessage) {
  return message.text ?? message.caption ?? ""
}

function parseCommand(text: string) {
  const match = text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]+))?$/)
  return match ? { name: match[1].toLowerCase(), args: match[2]?.trim() ?? "" } : null
}

function urlEntities(message: TelegramMessage) {
  const source = textOf(message)
  const urls = new Set<string>()
  for (const entity of [...(message.entities ?? []), ...(message.caption_entities ?? [])]) {
    if (entity.type === "text_link" && entity.url) urls.add(entity.url)
    if (entity.type === "url") urls.add(source.slice(entity.offset, entity.offset + entity.length))
  }
  for (const match of source.matchAll(urlRegex)) urls.add(match[0])
  return [...urls]
    .map((value) => value.trim().replace(/[.,!?;:]+$/, ""))
    .filter((value) => /^https?:\/\//i.test(value))
}

function addressScanType(text: string, index: number, length: number): ScamGuardScanType {
  const nearby = text.slice(Math.max(0, index - 40), Math.min(text.length, index + length + 40))
  return /\b(?:token|mint|ticker|coin|ca|contract|spender)\b/i.test(nearby) ? "token" : "wallet"
}

function candidateKey(candidate: AdvancedScanCandidate) {
  return `${candidate.type}:${candidate.chain}:${candidate.value.trim().toLowerCase()}`
}

export function extractAdvancedScanCandidates(message: TelegramMessage) {
  const text = textOf(message)
  const candidates = new Map<string, AdvancedScanCandidate>()
  const add = (candidate: AdvancedScanCandidate) => candidates.set(candidateKey(candidate), candidate)

  for (const value of urlEntities(message)) {
    add({ type: "url", value, chain: "unknown", source: "url" })
  }
  for (const match of text.matchAll(evmAddressRegex)) {
    add({
      type: addressScanType(text, match.index ?? 0, match[0].length),
      value: match[0],
      chain: "evm",
      source: "address",
    })
  }
  for (const match of text.matchAll(solanaAddressRegex)) {
    if (knownSolanaPrograms.has(match[0])) continue
    add({
      type: addressScanType(text, match.index ?? 0, match[0].length),
      value: match[0],
      chain: "solana",
      source: "address",
    })
  }

  const payload = text.match(base64PayloadRegex)?.find((value) => value.length >= 100)
  if (payload || transactionIntentRegex.test(text)) {
    const chain: ScamGuardChain = /eth_|personal_sign|setApprovalForAll|0x[a-fA-F0-9]{8,}/i.test(text)
      ? "evm"
      : /solana|approveChecked|setAuthority|closeAccount/i.test(text)
        ? "solana"
        : "unknown"
    add({ type: "transaction", value: payload ?? text.trim().slice(0, 2000), chain, source: "transaction" })
  }
  if (secretRequestRegex.test(text)) {
    add({
      type: "transaction",
      value: "Secret wallet material request detected in Telegram message",
      chain: "unknown",
      source: "secret",
    })
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
    signals: [{
      code: "SECRET_MATERIAL_REQUEST",
      severity: "critical",
      title: "Secret wallet material request",
      detail: "The message contains non-negated language requesting a recovery phrase, private key, or mnemonic.",
    }],
    actions: ["Do not share any wallet secret.", "Delete the message and review the sender."],
    metadata: { chain: "unknown", rpcStatus: "not_applicable", decodedIntent: { category: "unknown", warnings: [] } },
    scannedAt: new Date().toISOString(),
  }
}

function incompleteScanResult(candidate: AdvancedScanCandidate, error: unknown): ScamGuardScanResult {
  return {
    id: `telegram-incomplete-${Date.now()}`,
    type: candidate.type,
    score: 35,
    riskLevel: "CAUTION",
    summary: "ScamGuard could not complete every verification step for this target.",
    confidence: "LOW",
    explanation: `The scan provider returned an operational error: ${error instanceof Error ? error.message.slice(0, 300) : "Unknown error"}`,
    signals: [{
      code: "SCAN_PROVIDER_INCOMPLETE",
      severity: "low",
      title: "Incomplete verification",
      detail: "Retry the target before connecting a wallet or signing.",
    }],
    actions: ["Retry the scan before interacting with this target."],
    metadata: { chain: candidate.chain, rpcStatus: "failed", decodedIntent: { category: "unknown", warnings: [] } },
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
    return applyProjectRegistryAssessment(result, assessProjectImpersonation(registry, candidate, messageText))
  } catch (error) {
    return incompleteScanResult(candidate, error)
  }
}

function settingsOf(context: AdvancedTelegramBotContext): AdvancedTelegramGroupSettings {
  return context.groupSettings ?? {
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
}

function baseUrl(context: AdvancedTelegramBotContext) {
  return context.publicBaseUrl?.replace(/\/$/, "") ?? "https://triproofprotocol.com"
}

function reply(
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
      reply_parameters: replyToMessage ? { message_id: message.message_id, allow_sending_without_reply: true } : undefined,
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    },
  }
}

async function isAdmin(message: TelegramMessage, context: AdvancedTelegramBotContext) {
  if (!message.from?.id || !context.isGroupAdmin) return false
  try {
    return await context.isGroupAdmin(message.chat.id, message.from.id)
  } catch {
    return false
  }
}

function actionLabel(action: TelegramModerationAction) {
  const labels: Record<TelegramModerationAction, string> = {
    WARN_ONLY: "Warn only",
    ADMIN_REVIEW: "Admin review",
    DELETE: "Delete message",
    DELETE_MUTE_1H: "Delete + mute 1h",
    DELETE_MUTE_24H: "Delete + mute 24h",
  }
  return labels[action]
}

function statusText(context: AdvancedTelegramBotContext) {
  const settings = settingsOf(context)
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
    "/guardian safe silent | compact | full",
    "/guardian high warn | review | delete | mute1h | mute24h",
    "/guardian critical warn | review | delete | mute1h | mute24h",
    "/guardian permissions",
  ].join("\n")
}

function parseModeration(value: string): TelegramModerationAction | null {
  return ({
    warn: "WARN_ONLY",
    review: "ADMIN_REVIEW",
    delete: "DELETE",
    mute1h: "DELETE_MUTE_1H",
    mute24h: "DELETE_MUTE_24H",
  } as Record<string, TelegramModerationAction>)[value] ?? null
}

async function guardianCommand(message: TelegramMessage, args: string, context: AdvancedTelegramBotContext) {
  const command = args.trim().toLowerCase()
  if (!command || command === "status") return [reply(message, statusText(context))]
  if (!(await isAdmin(message, context))) return [reply(message, "Only a verified group administrator can change Guardian settings.")]

  if (command.startsWith("connect ")) {
    if (!context.claimGroup) return [reply(message, "Group connection is temporarily unavailable.")]
    const connected = await context.claimGroup(message.chat.id, command.slice(8).trim())
    return [reply(message, connected.ok ? `GROUP GUARDIAN CONNECTED\n\n${connected.title ?? "This group"} is now protected.` : connected.reason ?? "Connection failed.")]
  }
  if (command === "permissions") {
    if (!context.getBotPermissions) return [reply(message, "Permission diagnostics are unavailable.")]
    try {
      const permissions = await context.getBotPermissions(message.chat.id)
      await context.savePermissionSnapshot?.(message.chat.id, permissions)
      return [reply(message, [
        "🧪 GROUP GUARDIAN PERMISSION TEST",
        "━━━━━━━━━━━━━━━━━━━━",
        `Bot: @${permissions.username ?? "unknown"}`,
        `Status: ${permissions.status}`,
        `Read messages: ${permissions.canReadMessages ? "OK" : "MISSING"}`,
        `Delete messages: ${permissions.canDeleteMessages ? "OK" : "MISSING"}`,
        `Restrict members: ${permissions.canRestrictMembers ? "OK" : "MISSING"}`,
        `Manage chat: ${permissions.canManageChat ? "OK" : "MISSING"}`,
      ].join("\n"))]
    } catch (error) {
      return [reply(message, `Permission test failed: ${error instanceof Error ? error.message : "Unknown error"}`)]
    }
  }
  if (!context.updateAdvancedGroupSettings) return [reply(message, "Group settings storage is unavailable.")]

  let values: AdvancedTelegramGroupUpdate | null = null
  if (command === "on") values = { guardianEnabled: true }
  if (command === "off") values = { guardianEnabled: false }
  if (command === "summary on") values = { dailySummary: true }
  if (command === "summary off") values = { dailySummary: false }
  if (command === "threshold caution") values = { alertLevel: "CAUTION" }
  if (command === "threshold high" || command === "threshold high_risk") values = { alertLevel: "HIGH_RISK" }
  if (command === "threshold critical") values = { alertLevel: "CRITICAL" }
  if (command === "safe silent") values = { safeMode: "SILENT" }
  if (command === "safe compact") values = { safeMode: "COMPACT" }
  if (command === "safe full") values = { safeMode: "FULL" }
  if (command === "automute on") values = { autoMuteCritical: true, criticalAction: "DELETE_MUTE_1H" }
  if (command === "automute off") values = { autoMuteCritical: false, criticalAction: "ADMIN_REVIEW" }
  if (command.startsWith("high ")) {
    const action = parseModeration(command.slice(5))
    if (action) values = { highRiskAction: action }
  }
  if (command.startsWith("critical ")) {
    const action = parseModeration(command.slice(9))
    if (action) values = {
      criticalAction: action,
      autoMuteCritical: action === "DELETE_MUTE_1H" || action === "DELETE_MUTE_24H",
    }
  }
  if (!values) return [reply(message, `Unknown Guardian setting.\n\n${statusText(context)}`)]
  const updated = await context.updateAdvancedGroupSettings(message.chat.id, values)
  return [reply(message, updated ? `GROUP GUARDIAN UPDATED\n\n${statusText({ ...context, groupSettings: updated })}` : "Update failed.")]
}

export function resolveModerationAction(input: {
  level: ScamGuardRiskLevel
  policyBlocked: boolean
  settings: Pick<AdvancedTelegramGroupSettings, "highRiskAction" | "criticalAction" | "autoMuteCritical">
}) {
  if (input.policyBlocked || input.level === "CRITICAL") {
    if (input.settings.autoMuteCritical && input.settings.criticalAction === "ADMIN_REVIEW") return "DELETE_MUTE_1H" as const
    return input.settings.criticalAction
  }
  return input.level === "HIGH_RISK" ? input.settings.highRiskAction : "WARN_ONLY"
}

async function moderate(
  message: TelegramMessage,
  action: TelegramModerationAction,
  context: AdvancedTelegramBotContext
) {
  if (action === "WARN_ONLY" || action === "ADMIN_REVIEW") return { deleted: false, note: "" }
  if (await isAdmin(message, context)) return { deleted: false, note: "Automatic moderation skipped for a group administrator." }

  const errors: string[] = []
  let deleted = false
  let muted = false
  try {
    deleted = Boolean(await context.deleteMessage?.(message.chat.id, message.message_id))
    if (!deleted) errors.push("message deletion unavailable")
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "message deletion failed")
  }
  if (action === "DELETE_MUTE_1H" || action === "DELETE_MUTE_24H") {
    try {
      if (!message.from?.id || !context.muteMember) throw new Error("member restriction unavailable")
      muted = await context.muteMember(message.chat.id, message.from.id, action === "DELETE_MUTE_24H" ? 86_400 : 3_600)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "member restriction failed")
    }
  }
  const completed = [deleted ? "message deleted" : "", muted ? "sender muted" : ""].filter(Boolean).join(" and ")
  return {
    deleted,
    note: errors.length ? `Quarantine partially applied: ${errors.join("; ")}.` : completed ? `Automatic quarantine applied: ${completed}.` : "",
  }
}

function keyboard(context: AdvancedTelegramBotContext, eventId?: string, offerModeration = false): TelegramSendMessage["reply_markup"] {
  const rows: NonNullable<TelegramSendMessage["reply_markup"]>["inline_keyboard"] = []
  if (eventId && offerModeration) {
    rows.push([
      { text: "Delete message", callback_data: `sg_delete:${eventId}` },
      { text: "Mute 1 hour", callback_data: `sg_mute:${eventId}:1` },
      { text: "Mute 24 hours", callback_data: `sg_mute:${eventId}:24` },
    ])
  }
  rows.push([
    { text: "Open full scanner", url: `${baseUrl(context)}/scamguard` },
    { text: "Threat Pool", url: `${baseUrl(context)}/threat-reports` },
  ])
  return { inline_keyboard: rows }
}

function targetLabel(item: CandidateResult) {
  return (item.result.metadata.domain ?? item.result.metadata.walletAddress ?? item.result.metadata.contractIntelligence?.target ?? item.candidate.value).slice(0, 90)
}

function combinedReport(results: CandidateResult[], moderationNote: string) {
  const highest = results.reduce((best, item) => riskRank[item.result.riskLevel] > riskRank[best.result.riskLevel] ? item : best)
  const icon = highest.result.riskLevel === "CRITICAL" ? "🛑" : highest.result.riskLevel === "HIGH_RISK" ? "⚠️" : highest.result.riskLevel === "CAUTION" ? "🟡" : "🟢"
  const lines = [
    "🛡️ SCAMGUARD GROUP GUARDIAN",
    "Multi-target security report",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `${icon} Highest status: ${highest.result.riskLevel.replace("_", " ")} · ${highest.result.score}/100`,
    `Targets checked: ${results.length} · Alert-level results: ${results.filter((item) => item.alerted).length}`,
    moderationNote ? `Moderation: ${moderationNote}` : "",
    "",
  ]
  for (const [index, item] of results.entries()) {
    lines.push(
      `${index + 1}. ${targetLabel(item)}`,
      `   ${item.result.riskLevel.replace("_", " ")} · ${item.result.score}/100 · ${item.result.confidence} confidence`,
      `   ${item.result.summary}`,
      item.result.signals[0] ? `   Signal: ${item.result.signals[0].title}` : "",
      item.repeatedCampaign ? `   Repeated campaign: ${item.occurrenceCount} appearances` : ""
    )
  }
  lines.push("", "Verify the project from an official registry asset before connecting a wallet or signing.")
  return lines.filter(Boolean).join("\n").slice(0, 3900)
}

async function record(
  message: TelegramMessage,
  candidate: AdvancedScanCandidate,
  result: ScamGuardScanResult,
  alerted: boolean,
  context: AdvancedTelegramBotContext
) {
  if (!context.recordScan) return { occurrenceCount: 1, repeatedCampaign: false, moderationRecommended: false }
  try {
    const event = await context.recordScan({ message, candidate, result, source: "GROUP_GUARDIAN", alerted })
    return {
      eventId: event.eventId,
      occurrenceCount: event.occurrenceCount,
      repeatedCampaign: event.repeatedCampaign,
      moderationRecommended: Boolean(event.senderBehavior?.moderationRecommended),
    }
  } catch {
    return { occurrenceCount: 1, repeatedCampaign: false, moderationRecommended: false }
  }
}

async function scanGroupMessage(message: TelegramMessage, context: AdvancedTelegramBotContext) {
  const settings = settingsOf(context)
  const candidates = extractAdvancedScanCandidates(message)
  if (!candidates.length) return []
  if (!settings.guardianEnabled || !settings.allowlisted) {
    return [reply(message, settings.guardianEnabled
      ? "Group Guardian is not approved for this group yet. Connect it from the Tri-Proof dashboard."
      : "Group Guardian is paused. A group administrator can restore it with /guardian on.")]
  }

  const allowance = await context.consumePersistentAllowance?.({ chatId: message.chat.id, userId: message.from?.id, group: true })
  if (allowance && !allowance.allowed) {
    return [reply(message, `ScamGuard scan limit reached. Retry in about ${Math.max(1, Math.ceil(allowance.retryAfterSeconds / 60))} minute(s).`)]
  }

  const registry = await loadActiveTelegramProjectRegistry().catch(() => [])
  const results: CandidateResult[] = []
  for (const candidate of candidates) {
    const result = await scanCandidate(candidate, textOf(message), registry)
    const policy = context.applyTeamPolicy
      ? await context.applyTeamPolicy({ candidate, result, chatId: message.chat.id })
      : { action: TeamPolicyAction.ALLOW, matched: [] }
    const alerted = policy.action !== TeamPolicyAction.ALLOW || riskRank[result.riskLevel] >= riskRank[settings.alertLevel]
    results.push({ candidate, result, policy, alerted, ...(await record(message, candidate, result, alerted, context)) })
  }

  const highest = results.reduce((best, item) => riskRank[item.result.riskLevel] > riskRank[best.result.riskLevel] ? item : best)
  const action = resolveModerationAction({
    level: highest.result.riskLevel,
    policyBlocked: results.some((item) => item.policy.action === TeamPolicyAction.BLOCK),
    settings,
  })
  const moderation = await moderate(message, action, context)
  const allSafe = results.every((item) => item.result.riskLevel === "SAFE")
  if (allSafe && settings.safeMode === "SILENT") return []
  if (allSafe && settings.safeMode === "COMPACT") {
    return [reply(message, [
      "🟢 SCAMGUARD GROUP SCAN",
      `${results.length} target${results.length === 1 ? "" : "s"} checked · no elevated risk detected`,
      "",
      ...results.slice(0, 5).map((item) => `• ${targetLabel(item)} — ${item.result.score}/100`),
    ].join("\n"), keyboard(context), !moderation.deleted)]
  }

  const dangerous = results.find((item) => item.alerted && ["HIGH_RISK", "CRITICAL"].includes(item.result.riskLevel)) ?? results.find((item) => item.alerted)
  return [reply(
    message,
    combinedReport(results, moderation.note),
    keyboard(context, dangerous?.eventId, action === "ADMIN_REVIEW" || action === "WARN_ONLY" || !moderation.deleted),
    !moderation.deleted
  )]
}

export async function handleAdvancedGroupUpdate(
  message: TelegramMessage,
  context: AdvancedTelegramBotContext
): Promise<TelegramBotAction[] | null> {
  const command = parseCommand(textOf(message))
  if (command?.name === "guardian") return guardianCommand(message, command.args, context)
  if (command) return null
  return scanGroupMessage(message, context)
}
