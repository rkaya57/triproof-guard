import assert from "node:assert/strict"
import test from "node:test"

import {
  callTelegramApiWithRetry,
  TelegramApiError,
} from "@/lib/telegram/api"

test("Telegram API retries transient 5xx responses", async (context) => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return new Response(JSON.stringify({ ok: false, description: "Temporary error" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  const result = await callTelegramApiWithRetry<{ message_id: number }>(
    "token",
    "sendMessage",
    { chat_id: 1, text: "test" },
    { maxAttempts: 3, timeoutMs: 2_000 }
  )
  assert.equal(result.result.message_id, 9)
  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
})

test("Telegram API honors retryable 429 responses", async (context) => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return new Response(
        JSON.stringify({ ok: false, description: "Too many requests", parameters: { retry_after: 0.001 } }),
        { status: 429, headers: { "content-type": "application/json" } }
      )
    }
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  const result = await callTelegramApiWithRetry<boolean>("token", "deleteMessage", {}, { maxAttempts: 2 })
  assert.equal(result.result, true)
  assert.equal(result.attempts, 2)
})

test("Telegram API does not retry permanent 4xx errors", async (context) => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({ ok: false, description: "Bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }
  context.after(() => {
    globalThis.fetch = originalFetch
  })

  await assert.rejects(
    () => callTelegramApiWithRetry("token", "sendMessage", {}, { maxAttempts: 4 }),
    (error: unknown) => error instanceof TelegramApiError && error.status === 400 && error.attempts === 1
  )
  assert.equal(calls, 1)
})
