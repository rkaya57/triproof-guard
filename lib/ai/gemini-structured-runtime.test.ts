import assert from "node:assert/strict"
import test from "node:test"

import {
  GEMINI_EVIDENCE_DEFAULT_MODEL,
  GEMINI_EVIDENCE_FALLBACK_MODEL,
  configuredEvidenceFallbackModel,
  configuredEvidenceModel,
  geminiStructuredGenerationConfig,
  requestGeminiStructuredWithFallback,
} from "./gemini-structured-runtime"

test("generateContent structured config uses responseMimeType plus responseJsonSchema", () => {
  const schema = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  }
  const config = geminiStructuredGenerationConfig(schema, {
    maxOutputTokens: 512,
    thinkingLevel: "low",
  }) as Record<string, unknown>

  assert.equal(config.responseMimeType, "application/json")
  assert.deepEqual(config.responseJsonSchema, schema)
  assert.equal("responseFormat" in config, false)
  assert.equal(config.maxOutputTokens, 512)
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: "low" })
})

test("evidence runtime defaults to Gemini 3.6 instead of inheriting the legacy general Gemini model", () => {
  const previousEvidence = process.env.GEMINI_EVIDENCE_MODEL
  const previousGeneral = process.env.GEMINI_MODEL
  try {
    delete process.env.GEMINI_EVIDENCE_MODEL
    process.env.GEMINI_MODEL = "gemini-3.5-flash"
    assert.equal(configuredEvidenceModel(), GEMINI_EVIDENCE_DEFAULT_MODEL)

    process.env.GEMINI_EVIDENCE_MODEL = "gemini-3.6-flash"
    assert.equal(configuredEvidenceModel(), "gemini-3.6-flash")
  } finally {
    if (previousEvidence === undefined) delete process.env.GEMINI_EVIDENCE_MODEL
    else process.env.GEMINI_EVIDENCE_MODEL = previousEvidence
    if (previousGeneral === undefined) delete process.env.GEMINI_MODEL
    else process.env.GEMINI_MODEL = previousGeneral
  }
})

test("evidence runtime has an independently configurable Flash Lite fallback", () => {
  const previous = process.env.GEMINI_EVIDENCE_FALLBACK_MODEL
  try {
    delete process.env.GEMINI_EVIDENCE_FALLBACK_MODEL
    assert.equal(configuredEvidenceFallbackModel(), GEMINI_EVIDENCE_FALLBACK_MODEL)
    process.env.GEMINI_EVIDENCE_FALLBACK_MODEL = "gemini-custom-fallback"
    assert.equal(configuredEvidenceFallbackModel(), "gemini-custom-fallback")
  } finally {
    if (previous === undefined) delete process.env.GEMINI_EVIDENCE_FALLBACK_MODEL
    else process.env.GEMINI_EVIDENCE_FALLBACK_MODEL = previous
  }
})

test("structured runtime retries once on the fallback model after a primary provider error", async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const previousFetch = globalThis.fetch
  const urls: string[] = []
  try {
    process.env.GEMINI_API_KEY = "test-key"
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      urls.push(url)
      if (urls.length === 1) {
        return new Response(
          JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }),
          { status: 429, headers: { "content-type": "application/json" } }
        )
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }) as typeof fetch

    const result = await requestGeminiStructuredWithFallback({
      model: "gemini-3.6-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      prompt: "Return ok.",
      systemInstruction: "Return JSON.",
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
      thinkingLevel: "low",
      timeoutMs: 1_000,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.model, "gemini-3.5-flash-lite")
    assert.equal(result.text, '{"ok":true}')
    assert.equal(urls.length, 2)
    assert.match(urls[0]!, /gemini-3\.6-flash/)
    assert.match(urls[1]!, /gemini-3\.5-flash-lite/)
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})
