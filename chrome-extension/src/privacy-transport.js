(() => {
  const nativeSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)

  function sanitizeUrl(value) {
    try {
      const url = new URL(String(value ?? ""))
      if (!/^https?:$/.test(url.protocol)) return String(value ?? "")
      url.username = ""
      url.password = ""
      url.search = ""
      url.hash = ""
      return url.toString()
    } catch {
      return String(value ?? "")
    }
  }

  function sanitizeLinks(values) {
    const seen = new Set()
    const result = []
    for (const value of Array.isArray(values) ? values : []) {
      const sanitized = sanitizeUrl(value)
      if (!/^https?:\/\//i.test(sanitized) || seen.has(sanitized)) continue
      seen.add(sanitized)
      result.push(sanitized)
      if (result.length >= 25) break
    }
    return result
  }

  function sanitizeMessage(message) {
    if (!message || typeof message !== "object") return message
    if (message.type === "SCAN_URL") {
      return { ...message, value: sanitizeUrl(message.value) }
    }
    if (message.type === "SCAN_TRANSACTION") {
      return { ...message, sourceUrl: sanitizeUrl(message.sourceUrl) }
    }
    if (message.type === "SCAN_LINKS") {
      return { ...message, links: sanitizeLinks(message.links) }
    }
    return message
  }

  chrome.runtime.sendMessage = function scamGuardPrivacySendMessage(...args) {
    if (args.length && args[0] && typeof args[0] === "object") {
      args[0] = sanitizeMessage(args[0])
    } else if (args.length > 1 && args[1] && typeof args[1] === "object") {
      args[1] = sanitizeMessage(args[1])
    }
    return nativeSendMessage(...args)
  }

  globalThis.ScamGuardPrivacyTransport = Object.freeze({
    sanitizeUrl,
    sanitizeLinks,
  })
})()
