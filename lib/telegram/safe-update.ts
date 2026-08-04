import { handleTelegramUpdate as handleTelegramUpdateBase } from "@/lib/telegram/bot"
import type {
  TelegramBotAction,
  TelegramBotContext as BaseTelegramBotContext,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramUpdate,
} from "@/lib/telegram/bot"
import {
  handleAdvancedGroupUpdate,
  type AdvancedTelegramBotContext,
} from "@/lib/telegram/guardian-v2"

export type TelegramBotContext = AdvancedTelegramBotContext
export type {
  TelegramBotAction,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramUpdate,
} from "@/lib/telegram/bot"

const bareDomainPattern = /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#][^\s<>]*)?$/i
const secretMaterialPattern = /\b(seed phrase|recovery phrase|secret phrase|private key|mnemonic)\b/gi
const benignSecretPrefixPattern = /\b(?:never|do\s+not|don't|does\s+not|doesn't|will\s+not|won't|must\s+not|mustn't|should\s+not|shouldn't|cannot|can't|without|no\s+legitimate\s+(?:project|website|site|bot|admin|moderator|support(?:\s+agent)?)|asla|hiçbir\s+zaman|kesinlikle)\b[^.!?,;\n]{0,90}$/i
const benignSecretSuffixPattern = /^(?:[^.!?,;\n]{0,24})\b(?:is\s+not\s+required|will\s+never\s+be\s+requested|is\s+never\s+requested|istemeyiz|istemiyoruz|istenmez|talep\s+etmeyiz|talep\s+etmiyoruz|paylaşmayın|vermeyin|girmeyin)\b/i
const privateScanCommandPattern = /^\/(?:scan|wallet|token|tx|report|watch)(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i
const scanTargetPattern = /https?:\/\/|\b0x[a-fA-F0-9]{40}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b|\b[A-Za-z0-9+/_=-]{100,}\b/

function cleanTelegramUrl(value: string) {
  return value.trim().replace(/[.,!?;:]+$/, "")
}

export function normalizeTelegramUrl(value: string) {
  const cleaned = cleanTelegramUrl(value)
  if (!cleaned || /^https?:\/\//i.test(cleaned)) return cleaned
  return bareDomainPattern.test(cleaned) ? `https://${cleaned}` : cleaned
}

function normalizeEntity(entity: TelegramMessageEntity, sourceText: string): TelegramMessageEntity {
  const raw = entity.type === "text_link" && entity.url
    ? entity.url
    : entity.type === "url"
      ? sourceText.slice(entity.offset, entity.offset + entity.length)
      : null
  if (!raw) return entity

  const normalized = normalizeTelegramUrl(raw)
  if (!normalized) return entity
  if (entity.type === "text_link") return { ...entity, url: normalized }

  return {
    ...entity,
    type: "text_link",
    url: normalized,
  }
}

export function maskBenignSecretMaterialMentions(text: string) {
  return text.replace(secretMaterialPattern, (match, _term: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 120), offset)
    const after = text.slice(offset + match.length, offset + match.length + 100)
    if (!benignSecretPrefixPattern.test(before) && !benignSecretSuffixPattern.test(after)) return match
    return " ".repeat(match.length)
  })
}

function normalizeMessage(message: TelegramMessage): TelegramMessage {
  const text = message.text
  const caption = message.caption

  return {
    ...message,
    text: text === undefined ? undefined : maskBenignSecretMaterialMentions(text),
    caption: caption === undefined ? undefined : maskBenignSecretMaterialMentions(caption),
    entities: message.entities?.map((entity) => normalizeEntity(entity, text ?? "")),
    caption_entities: message.caption_entities?.map((entity) => normalizeEntity(entity, caption ?? "")),
  }
}

export function normalizeTelegramUpdate(update: TelegramUpdate): TelegramUpdate {
  return {
    ...update,
    message: update.message ? normalizeMessage(update.message) : undefined,
    edited_message: update.edited_message ? normalizeMessage(update.edited_message) : undefined,
  }
}

function baseContext(context: TelegramBotContext): BaseTelegramBotContext {
  return {
    publicBaseUrl: context.publicBaseUrl,
    geminiConfigured: context.geminiConfigured,
    groupAlertLevel: context.groupAlertLevel,
    groupSettings: context.groupSettings,
    isGroupAdmin: context.isGroupAdmin,
    claimGroup: context.claimGroup,
    authorizeGroupManager: context.authorizeGroupManager,
    loadHistory: context.loadHistory,
    loadSummary: context.loadSummary,
    recordScan: context.recordScan,
    applyTeamPolicy: context.applyTeamPolicy,
    addWatch: context.addWatch,
    addWatchFromEvent: context.addWatchFromEvent,
    listWatches: context.listWatches,
    removeWatch: context.removeWatch,
    findWatchAlerts: context.findWatchAlerts,
    muteMember: context.muteMember,
  }
}

function rateLimitReply(message: TelegramMessage, seconds: number): TelegramBotAction {
  return {
    method: "sendMessage",
    payload: {
      chat_id: message.chat.id,
      text: `ScamGuard scan limit reached. Please wait about ${Math.max(1, Math.ceil(seconds / 60))} minute(s), then try again.`,
      reply_parameters: {
        message_id: message.message_id,
        allow_sending_without_reply: true,
      },
      disable_web_page_preview: true,
    },
  }
}

function shouldLimitPrivateMessage(message: TelegramMessage) {
  const text = message.text ?? message.caption ?? ""
  return privateScanCommandPattern.test(text.trim()) || scanTargetPattern.test(text)
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  context: TelegramBotContext = {}
): Promise<TelegramBotAction[]> {
  const normalized = normalizeTelegramUpdate(update)
  const message = normalized.message ?? normalized.edited_message
  if (!message) return handleTelegramUpdateBase(normalized, baseContext(context))

  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup"
  if (isGroup) {
    const advanced = await handleAdvancedGroupUpdate(message, context)
    if (advanced !== null) return advanced
  }

  if (message.chat.type === "private" && shouldLimitPrivateMessage(message)) {
    const allowance = await context.consumePersistentAllowance?.({
      chatId: message.chat.id,
      userId: message.from?.id,
      group: false,
    })
    if (allowance && !allowance.allowed) {
      return [rateLimitReply(message, allowance.retryAfterSeconds)]
    }
  }

  return handleTelegramUpdateBase(normalized, baseContext(context))
}
