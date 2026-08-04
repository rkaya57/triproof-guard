import type { TelegramBotAction } from "@/lib/telegram/bot"
import type { TelegramBotPermissionSnapshot } from "@/lib/telegram/guardian-v2"

type TelegramApiResponse<T> = {
  ok: boolean
  result?: T
  description?: string
  parameters?: {
    retry_after?: number
  }
}

type TelegramApiCallResult<T> = {
  result: T
  attempts: number
}

export class TelegramApiError extends Error {
  status: number
  retryAfterSeconds: number | null
  retryable: boolean
  attempts: number

  constructor(input: {
    method: string
    status: number
    description: string
    retryAfterSeconds?: number | null
    retryable: boolean
    attempts: number
  }) {
    super(`Telegram ${input.method} failed: ${input.status} ${input.description}`)
    this.name = "TelegramApiError"
    this.status = input.status
    this.retryAfterSeconds = input.retryAfterSeconds ?? null
    this.retryable = input.retryable
    this.attempts = input.attempts
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function retryDelay(attempt: number, retryAfterSeconds?: number | null) {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 5_000)
  }
  return Math.min(250 * 2 ** Math.max(0, attempt - 1), 3_000) + Math.floor(Math.random() * 150)
}

export async function callTelegramApiWithRetry<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  options: { maxAttempts?: number; timeoutMs?: number } = {}
): Promise<TelegramApiCallResult<T>> {
  const maxAttempts = Math.min(Math.max(options.maxAttempts ?? 4, 1), 6)
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8_000, 1_000), 15_000)
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      })
      const payload = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null
      if (response.ok && payload?.ok && payload.result !== undefined) {
        return { result: payload.result, attempts: attempt }
      }

      const retryAfterSeconds = payload?.parameters?.retry_after ?? null
      const retryable = response.status === 429 || response.status >= 500
      const error = new TelegramApiError({
        method,
        status: response.status,
        description: payload?.description ?? "Unknown Telegram API error",
        retryAfterSeconds,
        retryable,
        attempts: attempt,
      })
      lastError = error
      if (!retryable || attempt >= maxAttempts) throw error
      await sleep(retryDelay(attempt, retryAfterSeconds))
    } catch (error) {
      lastError = error
      if (error instanceof TelegramApiError) {
        if (!error.retryable || attempt >= maxAttempts) throw error
        continue
      }
      if (attempt >= maxAttempts) {
        throw new TelegramApiError({
          method,
          status: 0,
          description: error instanceof Error ? error.message : "Network request failed",
          retryable: true,
          attempts: attempt,
        })
      }
      await sleep(retryDelay(attempt))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Telegram ${method} failed.`)
}

async function callTelegramApi<T>(token: string, method: string, body: Record<string, unknown>) {
  return (await callTelegramApiWithRetry<T>(token, method, body)).result
}

export async function sendTelegramAction(token: string, action: TelegramBotAction) {
  if (action.method === "sendMessage") {
    const sent = await callTelegramApiWithRetry<unknown>(token, "sendMessage", action.payload)
    return { attempts: sent.attempts }
  }
  if (action.method === "answerInlineQuery") {
    if (!action.inlineQuery) throw new Error("Inline query action is missing its query payload.")
    const sent = await callTelegramApiWithRetry<unknown>(token, "answerInlineQuery", action.inlineQuery)
    return { attempts: sent.attempts }
  }
  return { attempts: 0 }
}

export async function sendTelegramMessage(token: string, chatId: string | number, text: string) {
  await callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 3900),
    disable_web_page_preview: true,
  })
}

export async function answerTelegramCallbackQuery(
  token: string,
  callbackQueryId: string,
  text: string,
  showAlert = false
) {
  await callTelegramApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text.slice(0, 180),
    show_alert: showAlert,
  })
}

export async function muteTelegramMember(
  token: string,
  chatId: number,
  userId: number,
  seconds = 60 * 60
) {
  await callTelegramApi(token, "restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
    until_date: Math.floor(Date.now() / 1000) + seconds,
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_manage_topics: false,
    },
  })
}

export async function deleteTelegramMessage(token: string, chatId: number, messageId: number) {
  return callTelegramApi<boolean>(token, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  })
}

export async function isTelegramGroupAdmin(token: string, chatId: number, userId: number) {
  const member = await callTelegramApi<{ status: string }>(token, "getChatMember", {
    chat_id: chatId,
    user_id: userId,
  })
  return member.status === "creator" || member.status === "administrator"
}

export async function getTelegramBotPermissions(
  token: string,
  chatId: number
): Promise<TelegramBotPermissionSnapshot> {
  const bot = await callTelegramApi<{ id: number; username?: string }>(token, "getMe", {})
  const member = await callTelegramApi<{
    status: string
    can_manage_chat?: boolean
    can_delete_messages?: boolean
    can_restrict_members?: boolean
  }>(token, "getChatMember", {
    chat_id: chatId,
    user_id: bot.id,
  })
  const administrator = member.status === "administrator" || member.status === "creator"
  return {
    botId: bot.id,
    username: bot.username ?? null,
    status: member.status,
    canReadMessages: administrator,
    canDeleteMessages: administrator && Boolean(member.can_delete_messages),
    canRestrictMembers: administrator && Boolean(member.can_restrict_members),
    canManageChat: administrator && Boolean(member.can_manage_chat),
    checkedAt: new Date().toISOString(),
  }
}
