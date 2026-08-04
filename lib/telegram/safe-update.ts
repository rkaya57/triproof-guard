import { handleTelegramUpdate as handleTelegramUpdateBase } from "@/lib/telegram/bot"
import type {
  TelegramBotAction,
  TelegramBotContext,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramUpdate,
} from "@/lib/telegram/bot"

export type {
  TelegramBotAction,
  TelegramBotContext,
  TelegramMessage,
  TelegramMessageEntity,
  TelegramUpdate,
} from "@/lib/telegram/bot"

const bareDomainPattern = /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#][^\s<>]*)?$/i
const secretMaterialPattern = /\b(seed phrase|recovery phrase|secret phrase|private key|mnemonic)\b/gi
const benignSecretPrefixPattern = /\b(?:never|do\s+not|don't|does\s+not|doesn't|will\s+not|won't|must\s+not|mustn't|should\s+not|shouldn't|cannot|can't|without|no\s+legitimate\s+(?:project|website|site|bot|admin|moderator|support(?:\s+agent)?)|asla|hiçbir\s+zaman|kesinlikle)\b[^.!?,;\n]{0,90}$/i
const benignSecretSuffixPattern = /^(?:[^.!?,;\n]{0,24})\b(?:is\s+not\s+required|will\s+never\s+be\s+requested|is\s+never\s+requested|istemeyiz|istemiyoruz|istenmez|talep\s+etmeyiz|talep\s+etmiyoruz|paylaşmayın|vermeyin|girmeyin)\b/i

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

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  context: TelegramBotContext = {}
): Promise<TelegramBotAction[]> {
  return handleTelegramUpdateBase(normalizeTelegramUpdate(update), context)
}
