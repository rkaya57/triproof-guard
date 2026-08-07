const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

export const GEMINI_PROVIDER_PROBE_VERSION = "2026-08-08.1" as const

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"] as const

type ProbeMode = "basic" | "structured"

export type GeminiProviderProbeAttempt = {
  model: (typeof MODELS)[number]
  mode: ProbeMode
  ok: boolean
  httpStatus: number | null
  providerStatus: string | null
  providerCode: number | null
  latencyMs: number | null
  responseObserved: boolean
  detail: string
}

export type GeminiProviderProbeResult = {
  version: typeof GEMINI_PROVIDER_PROBE_VERSION
  generatedAt: string
  keyConfigured: boolean
  configuredModel: string | null
  overallReady: boolean
  attempts: GeminiProviderProbeAttempt[]
}

function configuredModel() {
  return (
    process.env.GEMINI_EVIDENCE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    null
  )
}

function sanitizeDetail(value: string) {
  return value
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, "[redacted-api-key]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[redacted-token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320)
}

function providerError(text: string) {
  try {
    const parsed = JSON.parse(text) as {
      error?: { code?: unknown; status?: unknown; message?: unknown }
    }
    return {
      code: typeof parsed.error?.code === "number" ? parsed.error.code : null,
      status: typeof parsed.error?.status === "string" ? parsed.error.status : null,
      message:
        typeof parsed.error?.message === "string"
          ? sanitizeDetail(parsed.error.message)
          : "Provider returned a non-success response.",
    }
  } catch {
    return {
      code: null,
      status: null,
      message: sanitizeDetail(text) || "Provider returned a non-success response.",
    }
  }
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return ""
  const parts = (
    candidates[0] as
      | { content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }
      | undefined
  )?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim()
}

function requestBody(mode: ProbeMode) {
  if (mode === "basic") {
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: "Reply with exactly OK." }],
        },
      ],
      generationConfig: { maxOutputTokens: 32 },
    }
  }

  return {
    contents: [
      {
        role: "user",
        parts: [{ text: "Return a JSON object whose ok field is true." }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 64,
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    },
  }
}

async function probeAttempt(
  apiKey: string,
  model: (typeof MODELS)[number],
  mode: ProbeMode
): Promise<GeminiProviderProbeAttempt> {
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
        body: JSON.stringify(requestBody(mode)),
        signal: AbortSignal.timeout(10_000),
      }
    )
    const latencyMs = Date.now() - startedAt
    const text = await response.text()

    if (!response.ok) {
      const error = providerError(text)
      return {
        model,
        mode,
        ok: false,
        httpStatus: response.status,
        providerStatus: error.status,
        providerCode: error.code,
        latencyMs,
        responseObserved: true,
        detail: error.message,
      }
    }

    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return {
        model,
        mode,
        ok: false,
        httpStatus: response.status,
        providerStatus: "INVALID_JSON_RESPONSE",
        providerCode: null,
        latencyMs,
        responseObserved: true,
        detail: "Provider returned HTTP 200 but the response body was not JSON.",
      }
    }

    const output = extractText(payload)
    if (!output) {
      return {
        model,
        mode,
        ok: false,
        httpStatus: response.status,
        providerStatus: "EMPTY_MODEL_OUTPUT",
        providerCode: null,
        latencyMs,
        responseObserved: true,
        detail: "Provider returned HTTP 200 but no non-thinking text output was present.",
      }
    }

    if (mode === "structured") {
      try {
        const structured = JSON.parse(output) as { ok?: unknown }
        if (structured.ok !== true) {
          return {
            model,
            mode,
            ok: false,
            httpStatus: response.status,
            providerStatus: "STRUCTURED_VALUE_MISMATCH",
            providerCode: null,
            latencyMs,
            responseObserved: true,
            detail: "Structured output was valid JSON but did not contain ok=true.",
          }
        }
      } catch {
        return {
          model,
          mode,
          ok: false,
          httpStatus: response.status,
          providerStatus: "INVALID_STRUCTURED_OUTPUT",
          providerCode: null,
          latencyMs,
          responseObserved: true,
          detail: "Structured-output request returned text that could not be parsed as JSON.",
        }
      }
    }

    return {
      model,
      mode,
      ok: true,
      httpStatus: response.status,
      providerStatus: "OK",
      providerCode: null,
      latencyMs,
      responseObserved: true,
      detail: "Provider request succeeded.",
    }
  } catch (error) {
    return {
      model,
      mode,
      ok: false,
      httpStatus: null,
      providerStatus: "TRANSPORT_ERROR",
      providerCode: null,
      latencyMs: Date.now() - startedAt,
      responseObserved: false,
      detail:
        error instanceof Error
          ? sanitizeDetail(error.message)
          : "Provider request failed before an HTTP response was observed.",
    }
  }
}

export async function runGeminiProviderProbe(): Promise<GeminiProviderProbeResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return {
      version: GEMINI_PROVIDER_PROBE_VERSION,
      generatedAt: new Date().toISOString(),
      keyConfigured: false,
      configuredModel: configuredModel(),
      overallReady: false,
      attempts: [],
    }
  }

  const attempts = [] as GeminiProviderProbeAttempt[]
  for (const model of MODELS) {
    attempts.push(await probeAttempt(apiKey, model, "basic"))
    attempts.push(await probeAttempt(apiKey, model, "structured"))
  }

  const overallReady = MODELS.some((model) => {
    const modelAttempts = attempts.filter((attempt) => attempt.model === model)
    return (
      modelAttempts.some((attempt) => attempt.mode === "basic" && attempt.ok) &&
      modelAttempts.some((attempt) => attempt.mode === "structured" && attempt.ok)
    )
  })

  return {
    version: GEMINI_PROVIDER_PROBE_VERSION,
    generatedAt: new Date().toISOString(),
    keyConfigured: true,
    configuredModel: configuredModel(),
    overallReady,
    attempts,
  }
}
