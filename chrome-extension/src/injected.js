(() => {
  const PAGE_SOURCE = "SCAMGUARD_PAGE"
  const EXTENSION_SOURCE = "SCAMGUARD_EXTENSION"
  const pending = new Map()
  let installAttempts = 0
  const EVM_GUARDED_METHODS = new Set([
    "eth_sendTransaction",
    "eth_signTransaction",
    "personal_sign",
    "eth_sign",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_sendCalls",
  ])

  function bytesToBase64(bytes) {
    let binary = ""
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  }

  function serializeTransactionLike(value) {
    if (Array.isArray(value)) {
      return JSON.stringify({
        kind: "transaction_batch",
        count: value.length,
        items: value.slice(0, 12).map((item, index) => ({
          index,
          value: serializeTransactionLike(item),
        })),
        truncated: value.length > 12,
      })
    }

    try {
      if (value && typeof value.serialize === "function") {
        const serialized = value.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        return bytesToBase64(serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized))
      }
    } catch {
      // Fall through to text summary.
    }

    try {
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === "bigint") return item.toString()
        if (item instanceof Uint8Array) return `[Uint8Array:${item.length}]`
        return item
      })
    } catch {
      return String(value)
    }
  }

  function publicKey(provider, chain) {
    try {
      if (chain === "evm") {
        const selected = provider?.selectedAddress
        return typeof selected === "string" ? selected : null
      }
      return provider?.publicKey?.toString?.() ?? null
    } catch {
      return null
    }
  }

  function serializedScanValue(method, transaction, chain) {
    const serialized = serializeTransactionLike(transaction)
    if (chain === "solana" && /signmessage/i.test(method)) {
      return JSON.stringify({ method, message: serialized })
    }
    return serialized
  }

  function askScamGuard({ method, transaction, provider, chain }) {
    const requestId = crypto.randomUUID()
    const value = serializedScanValue(method, transaction, chain)
    window.postMessage({
      source: PAGE_SOURCE,
      type: "SCAMGUARD_SIGN_REQUEST",
      requestId,
      method,
      chain,
      value,
      walletAddress: publicKey(provider, chain),
    }, "*")

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        pending.delete(requestId)
        resolve({ allow: false, error: "ScamGuard timed out before signing." })
      }, 30_000)
      pending.set(requestId, { resolve, timeout })
    })
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== EXTENSION_SOURCE || data.type !== "SCAMGUARD_SIGN_RESPONSE") return
    const entry = pending.get(data.requestId)
    if (!entry) return
    window.clearTimeout(entry.timeout)
    pending.delete(data.requestId)
    entry.resolve(data)
  })

  function wrapProvider(provider) {
    if (!provider || provider.__scamguardWrapped) return

    const methods = ["signTransaction", "signAndSendTransaction", "signAllTransactions", "signMessage"]
    for (const method of methods) {
      const original = provider[method]
      if (typeof original !== "function") continue
      provider[method] = async function wrappedScamGuardSign(...args) {
        const transaction = method === "signAllTransactions" && Array.isArray(args[0]) ? args[0] : args[0]
        const decision = await askScamGuard({ method, transaction, provider, chain: "solana" })
        if (!decision.allow) {
          throw new Error(decision.error || "ScamGuard blocked or cancelled this signing request.")
        }
        return original.apply(this, args)
      }
    }

    if (typeof provider.request === "function") {
      const originalRequest = provider.request
      provider.request = async function wrappedScamGuardRequest(args) {
        const method = args?.method
        if (typeof method === "string" && /sign/i.test(method)) {
          const decision = await askScamGuard({
            method,
            transaction: args?.params ?? args,
            provider,
            chain: "solana",
          })
          if (!decision.allow) {
            throw new Error(decision.error || "ScamGuard blocked or cancelled this signing request.")
          }
        }
        return originalRequest.apply(this, arguments)
      }
    }

    Object.defineProperty(provider, "__scamguardWrapped", {
      value: true,
      enumerable: false,
      configurable: false,
    })
  }

  function wrapEvmProvider(provider) {
    if (!provider || provider.__scamguardEvmWrapped || typeof provider.request !== "function") return
    const originalRequest = provider.request
    provider.request = async function wrappedScamGuardEvmRequest(args) {
      const method = args?.method
      const shouldScan = typeof method === "string" && EVM_GUARDED_METHODS.has(method)
      if (shouldScan) {
        const decision = await askScamGuard({
          method,
          transaction: { method, params: args?.params ?? [] },
          provider,
          chain: "evm",
        })
        if (!decision.allow) {
          throw new Error(decision.error || "ScamGuard blocked or cancelled this EVM request.")
        }
      }
      return originalRequest.apply(this, arguments)
    }
    Object.defineProperty(provider, "__scamguardEvmWrapped", {
      value: true,
      enumerable: false,
      configurable: false,
    })
  }

  function uniqueProviders(candidates) {
    return [...new Set(candidates.filter(Boolean))]
  }

  function solanaProviders() {
    return uniqueProviders([
      window.solana,
      window.backpack?.solana,
      window.phantom?.solana,
      window.solflare,
      window.glow,
    ])
  }

  function evmProviders() {
    const root = window.ethereum
    return uniqueProviders([
      root,
      ...(Array.isArray(root?.providers) ? root.providers : []),
      window.rabby,
      window.rabby?.ethereum,
      window.trustwallet?.ethereum,
      window.okxwallet,
      window.okxwallet?.ethereum,
      window.coinbaseWalletExtension,
      window.coinbaseWalletExtension?.ethereum,
    ])
  }

  function install() {
    for (const provider of solanaProviders()) wrapProvider(provider)
    for (const provider of evmProviders()) wrapEvmProvider(provider)
  }

  install()
  const timer = window.setInterval(() => {
    installAttempts += 1
    install()
    if (installAttempts > 80) window.clearInterval(timer)
  }, 300)
})()
