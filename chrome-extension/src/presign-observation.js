(() => {
  const MAX_METHOD_LENGTH = 96
  const MAX_TARGETS = 8
  const MAX_REASONS = 8
  const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/
  const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  const HIGH_IMPACT_METHODS = new Set([
    "eth_sendTransaction",
    "eth_signTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "eth_sign",
    "personal_sign",
    "wallet_sendCalls",
    "signTransaction",
    "signAndSendTransaction",
    "signAllTransactions",
    "signMessage",
  ])

  function safeMethod(value) {
    return typeof value === "string" ? value.replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, MAX_METHOD_LENGTH) : "unknown"
  }

  function byteLength(value) {
    try {
      if (value instanceof Uint8Array) return value.byteLength
      if (ArrayBuffer.isView(value)) return value.byteLength
      if (value instanceof ArrayBuffer) return value.byteLength
      if (typeof value === "string") return new TextEncoder().encode(value).byteLength
      return new TextEncoder().encode(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)).byteLength
    } catch {
      return 0
    }
  }

  function collectAddresses(value, out = new Set(), depth = 0) {
    if (out.size >= MAX_TARGETS || depth > 5 || value == null) return out
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (EVM_ADDRESS.test(trimmed) || SOLANA_ADDRESS.test(trimmed)) out.add(trimmed)
      return out
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 24)) collectAddresses(item, out, depth + 1)
      return out
    }
    if (typeof value !== "object") return out
    for (const [key, item] of Object.entries(value).slice(0, 32)) {
      if (/^(data|input|message|signature|serializedTransaction|rawTransaction|privateKey|secret|seed|mnemonic)$/i.test(key)) continue
      collectAddresses(item, out, depth + 1)
    }
    return out
  }

  function semanticHints(method, value) {
    const reasons = []
    const normalizedMethod = String(method ?? "").toLowerCase()
    let shallowText = ""
    try {
      if (typeof value === "string") shallowText = value.slice(0, 256).toLowerCase()
      else if (value && typeof value === "object") {
        shallowText = Object.keys(value).slice(0, 32).join(" ").toLowerCase()
      }
    } catch {
      shallowText = ""
    }

    if (/signtypeddata/.test(normalizedMethod)) reasons.push("typed_data_signature")
    if (/signmessage|personal_sign|eth_sign$/.test(normalizedMethod)) reasons.push("message_signature")
    if (/sendtransaction|signtransaction|signalltransactions/.test(normalizedMethod)) reasons.push("transaction_signature")
    if (/wallet_sendcalls/.test(normalizedMethod)) reasons.push("batched_wallet_calls")
    if (/switch.*chain|add.*chain/.test(normalizedMethod)) reasons.push("network_change")
    if (/approve|permit|delegate/.test(shallowText)) reasons.push("approval_semantics")
    if (/setauthority|authority/.test(shallowText)) reasons.push("authority_semantics")
    if (/transfer|send/.test(shallowText)) reasons.push("transfer_semantics")
    return [...new Set(reasons)].slice(0, MAX_REASONS)
  }

  function requestCategory(method) {
    const normalized = String(method ?? "").toLowerCase()
    if (/signtypeddata|signmessage|personal_sign|eth_sign$/.test(normalized)) return "signature"
    if (/sendtransaction|signtransaction|signalltransactions|wallet_sendcalls/.test(normalized)) return "transaction"
    if (/switch.*chain|add.*chain/.test(normalized)) return "network"
    if (/account|connect/.test(normalized)) return "account"
    return "unknown"
  }

  function createObservation({ method, payload, chain, origin }) {
    const normalizedMethod = safeMethod(method)
    const hints = semanticHints(normalizedMethod, payload)
    return {
      version: 1,
      kind: "presign_observation",
      chain: chain === "solana" || chain === "evm" ? chain : "unknown",
      method: normalizedMethod,
      category: requestCategory(normalizedMethod),
      origin: typeof origin === "string" ? origin.slice(0, 512) : "",
      highImpact: HIGH_IMPACT_METHODS.has(normalizedMethod) || hints.some((hint) => ["approval_semantics", "authority_semantics"].includes(hint)),
      reasons: hints,
      targets: [...collectAddresses(payload)].slice(0, MAX_TARGETS),
      payloadBytes: byteLength(payload),
      rawPayloadStored: false,
      privacy: {
        arbitraryMessageContent: "redacted",
        typedDataBody: "redacted",
        serializedTransaction: "redacted",
        secretMaterial: "never_collected",
      },
    }
  }

  globalThis.ScamGuardPreSignObservation = Object.freeze({ createObservation })
})()
