"use client"

import { useEffect, useId, useRef } from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey?: string | null
  onToken: (token: string | null) => void
}) {
  const reactId = useId().replaceAll(":", "")
  const containerId = `turnstile-${reactId}`
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    let poll: number | null = null

    const render = () => {
      if (cancelled || widgetId.current || !window.turnstile) return
      widgetId.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        theme: "dark",
        size: "flexible",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      })
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-triproof-turnstile="true"]')
    if (!existing) {
      const script = document.createElement("script")
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      script.async = true
      script.defer = true
      script.dataset.triproofTurnstile = "true"
      script.addEventListener("load", render, { once: true })
      document.head.appendChild(script)
    } else {
      poll = window.setInterval(() => {
        render()
        if (widgetId.current && poll !== null) window.clearInterval(poll)
      }, 100)
    }

    render()
    return () => {
      cancelled = true
      if (poll !== null) window.clearInterval(poll)
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [containerId, onToken, siteKey])

  if (!siteKey) return null
  return <div id={containerId} className="min-h-[65px] w-full overflow-hidden rounded-lg" />
}
