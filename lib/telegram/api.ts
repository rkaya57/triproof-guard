import type { TelegramBotAction } from "@/lib/telegram/bot"

type TelegramApiResponse<T> = {
  ok: boolean
  result?: T
  description?: string
}

async function callTelegramApi<T>(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null

  if (!response.ok || !payload?.ok || payload.result === undefined) {
    throw new Error(
      `Telegram ${method} failed: ${response.status} ${payload?.description ?? "Unknown Telegram API error"}`
    )
  }

  return payload.result
}

export async function sendTelegramAction(token: string, action: TelegramBotAction) {
  if (action.method !== "sendMessage") return
  await callTelegramApi(token, "sendMessage", action.payload)
}

export async function sendTelegramMessage(token: string, chatId: string | number, text: string) {
  await callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 3900),
    disable_web_page_preview: true,
  })
}

export async function answerTelegramCallbackQuery(token: string, callbackQueryId: string, text: string, showAlert = false) {
  await callTelegramApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text.slice(0, 180),
    show_alert: showAlert,
  })
}

export async function muteTelegramMember(token: string, chatId: number, userId: number, seconds = 60 * 60) {
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

export async function isTelegramGroupAdmin(token: string, chatId: number, userId: number) {
  const member = await callTelegramApi<{ status: string }>(token, "getChatMember", {
    chat_id: chatId,
    user_id: userId,
  })
  return member.status === "creator" || member.status === "administrator"
}
