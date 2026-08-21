import {
  isSupportedWebhookEvent,
  SUPPORTED_WEBHOOK_EVENTS,
} from "@/lib/webhooks/campaign-events"
import { isAllowedWebhookHostname } from "@/lib/webhooks/egress"

export type SupportedWebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number]

export function normalizeWebhookUrl(value: unknown, options: { production?: boolean } = {}) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value.trim())
    const production = options.production ?? process.env.NODE_ENV === "production"
    if (production && url.protocol !== "https:") return null
    if (!production && url.protocol !== "https:" && url.protocol !== "http:") return null
    if (url.username || url.password) return null
    if (!isAllowedWebhookHostname(url.hostname)) return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

export function normalizeWebhookEvents(
  value: unknown,
  options: { fallback?: readonly string[]; allowEmpty?: boolean } = {},
): SupportedWebhookEvent[] | null {
  if (!Array.isArray(value)) {
    const fallback = options.fallback ?? ["analysis.completed"]
    return [...new Set(fallback.filter(isSupportedWebhookEvent))]
  }

  const events = [...new Set(value.map(String).filter(isSupportedWebhookEvent))]
  if (events.length > 0) return events
  if (options.allowEmpty) return []

  const fallback = options.fallback ?? []
  const normalizedFallback = [...new Set(fallback.filter(isSupportedWebhookEvent))]
  return normalizedFallback.length ? normalizedFallback : null
}

export function normalizeWebhookDescription(value: unknown) {
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const normalized = value.trim().slice(0, 200)
  return normalized || null
}
