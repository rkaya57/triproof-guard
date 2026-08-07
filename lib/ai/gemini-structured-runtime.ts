const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

export const GEMINI_EVIDENCE_RUNTIME_VERSION = "2026-08-08.1" as const
export const GEMINI_EVIDENCE_DEFAULT_MODEL = "gemini-3.6-flash" as const
export const GEMINI_EVIDENCE_FALLBACK_MODEL = "gemini-3.5-flash-lite" as const

export type GeminiStructuredResult =
  | {
      ok: true
      model: string
      text: string
      latencyMs: number
      httpStatus: number
    }
  | {
      ok: false
      model: string | null
      latencyMs: number | null
      httpStatus: number | null
      reason:
        | "not_configured"
        | "provider_error"
        | "empty_output"
        | "transport_error"
      providerStatus: string | null
      providerCode: number | null
    }

function validModel(value: string | undefined | null) {
  const normalized = value?.trim() ?? ""
  return /^[a-zA-Z0-9._-]{1,80}$/.test(normalized) ? normalized : null
}

export function configuredEvidenceModel() {
  return (
    validModel(process.env.GEMINI_EVIDENCE_MODEL) ??
    GEMINI_EVIDENCE_DEFAULT_MODEL
  )
}

export function configuredClusterModel() {
  return (
    validModel(process.env.GEMINI_CLUSTER_MODEL) ??
    validModel(process.env.GEMINI_EVIDENCE_MODEL) ??
    GEMINI_EVIDENCE_DEFAULT_MODEL
  )
}

export function geminiStructuredGenerationConfig(
  schema: object,
  options: { maxOutputTokens?: number; thinkingLevel?: "minimal" | "low" | "medium" | "high" } = {}
) {
  return {
    maxOutputTokens: options.maxOutputTokens ?? 2400,
    thinkingConfig: { thinkingLevel: options.thinkingLevel ?? "medium" },
    responseMimeType: "application/json",
    responseJsonSchema: schema,
  }
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return null
  const parts = (
    candidates[0] as
      | { content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }
      | undefined
  )?.content?.parts
  if (!Array.isArray(parts)) return null
  const text = parts
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim()
  return text || null
}

function parseProviderError(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { status: null, code: null }
  }
  const error = (payload as { error?: unknown }).error
  if (!error || typeof error !== "object") {
    return { status: null, code: null }
  }
  const typed = error as { status?: unknown; code?: unknown }
  return {
    status: typeof typed.status === "string" ? typed.status : null,
    code: typeof typed.code === "number" ? typed.code : null,
  }
}

export async function requestGeminiStructured(options: {
  prompt: string
  schema: object
  systemInstruction: string
  model?: string
  maxOutputTokens?: number
  thinkingLevel?: "minimal" | "low" | "medium" | "high"
  timeoutMs?: number
}): Promise<GeminiStructuredResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      model: null,
      latencyMs: null,
      httpStatus: null,
      reason: "not_configured",
      providerStatus: null,
      providerCode: null,
    }
  }

  const model = validModel(options.model) ?? GEMINI_EVIDENCE_DEFAULT_MODEL
  const startedAt = Date.now()

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: options.systemInstruction }],
          },
          contents: [{ role: "user", parts: [{ text: options.prompt }] }],
          generationConfig: geminiStructuredGenerationConfig(options.schema, {
            maxOutputTokens: options.maxOutputTokens,
            thinkingLevel: options.thinkingLevel,
          }),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      }
    )

    const latencyMs = Date.now() - startedAt
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      const provider = parseProviderError(payload)
      return {
        ok: false,
        model,
        latencyMs,
        httpStatus: response.status,
        reason: "provider_error",
        providerStatus: provider.status,
        providerCode: provider.code,
      }
    }

    const text = extractResponseText(payload)
    if (!text) {
      return {
        ok: false,
        model,
        latencyMs,
        httpStatus: response.status,
        reason: "empty_output",
        providerStatus: null,
        providerCode: null,
      }
    }

    return {
      ok: true,
      model,
      text,
      latencyMs,
      httpStatus: response.status,
    }
  } catch {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      httpStatus: null,
      reason: "transport_error",
      providerStatus: null,
      providerCode: null,
    }
  }
}
