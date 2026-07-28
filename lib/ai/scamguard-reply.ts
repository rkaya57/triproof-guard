import type { ScamGuardScanResult } from "@/lib/scamguard/engine"

export type ScamGuardAiReply = {
  source: "gemini" | "fallback"
  model: string | null
  headline: string
  explanation: string
  nextSteps: string[]
}

const defaultModel = "gemini-3.5-flash"
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models"

function sanitizeText(value: string) {
  return value
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi, "[domain]")
    .replace(/0x[a-fA-F0-9]{16,}/g, "[address]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[address]")
    .replace(/\s+/g, " ")
    .trim()
}

function configuredModel() {
  const model = process.env.GEMINI_MODEL?.trim() || defaultModel
  return /^[a-zA-Z0-9._-]{1,80}$/.test(model) ? model : defaultModel
}

function safeList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeText(item).slice(0, 260))
    .filter(Boolean)
    .slice(0, limit)
}

export function buildScamGuardReplyFallback(result: ScamGuardScanResult): ScamGuardAiReply {
  return {
    source: "fallback",
    model: null,
    headline: result.riskLevel === "SAFE" ? "No major threat pattern was found." : "Pause and verify before you interact.",
    explanation: result.explanation,
    nextSteps: result.actions.slice(0, 3),
  }
}

function parseReply(value: string): Omit<ScamGuardAiReply, "source" | "model"> | null {
  const normalized = value.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "")
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>
    const headline = typeof parsed.headline === "string" ? sanitizeText(parsed.headline).slice(0, 180) : ""
    const explanation = typeof parsed.explanation === "string" ? sanitizeText(parsed.explanation).slice(0, 720) : ""
    if (!headline || !explanation) return null
    return { headline, explanation, nextSteps: safeList(parsed.nextSteps, 3) }
  } catch {
    return null
  }
}

export async function generateScamGuardAiReply(result: ScamGuardScanResult): Promise<ScamGuardAiReply> {
  const fallback = buildScamGuardReplyFallback(result)
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return fallback

  const evidence = {
    riskLevel: result.riskLevel,
    score: result.score,
    confidence: result.confidence,
    scanType: result.type,
    summary: sanitizeText(result.summary),
    explanation: sanitizeText(result.explanation),
    signals: result.signals.slice(0, 4).map((signal) => ({
      title: sanitizeText(signal.title),
      detail: sanitizeText(signal.detail),
      severity: signal.severity,
    })),
    recommendedActions: result.actions.slice(0, 3).map(sanitizeText),
  }
  const prompt = [
    "Write a compact, clear pre-sign security reply from the supplied ScamGuard evidence JSON.",
    "Use only the supplied evidence. Do not invent facts, targets, identities, or guarantees.",
    "Do not weaken a warning level and do not tell a user to provide a seed phrase, private key, password, or recovery phrase.",
    "Return JSON only with headline, explanation, nextSteps. Keep nextSteps to at most three concise strings.",
    `Evidence JSON:\n${JSON.stringify(evidence)}`,
  ].join("\n\n")
  const model = configuredModel()

  try {
    const response = await fetch(`${endpoint}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 420, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(4_000),
    })
    if (!response.ok) return fallback
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? ""
    const parsed = parseReply(text)
    return parsed ? { ...parsed, source: "gemini", model } : fallback
  } catch {
    return fallback
  }
}
