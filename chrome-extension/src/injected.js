(() => {
  const INSTALL_MARKER = "__scamguardMainWorldHookInstalledV1"
  if (window[INSTALL_MARKER]) return
  Object.defineProperty(window, INSTALL_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  })

  const PAGE_SOURCE = "SCAMGUARD_PAGE"
  const EXTENSION_SOURCE = "SCAMGUARD_EXTENSION"
  const BRIDGE_INIT_TYPE = "SCAMGUARD_BRIDGE_INIT_V1"
  const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN"
  const pending = new Map()
  let installAttempts = 0
  let bridgePort = null
  let resolveBridgeReady
  const bridgeReady = new Promise((resolve) => {
    resolveBridgeReady = resolve
  })

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

  const SOLANA_PROGRAM_LABELS = {
    "11111111111111111111111111111111": "System Program",
    [SPL_TOKEN_PROGRAM_ID]: "SPL Token Program",
    [TOKEN_2022_PROGRAM_ID]: "Token-2022 Program",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Program",
    "ComputeBudget111111111111111111111111111111": "Compute Budget Program",
    "JUP6LkbZbjS1jKKwapd7YHKyQfCwzyxSAYQmRjsBnxN": "Jupiter Aggregator",
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": "Jupiter Aggregator",
    "RVKd61ztZW9GKqKpHfF7vrbgBKYS9CagHokxraJALbk": "Raydium AMM",
    "dRiftyHA39MWEi3m9xxcDjQ2BuBuKLKmiNYkq3fK4nR": "Drift Protocol",
  }
  const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

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

  function addressText(value) {
    try {
      return value?.toBase58?.() ?? value?.toString?.() ?? (typeof value === "string" ? value : "")
    } catch {
      return ""
    }
  }

  function instructionBytes(value) {
    if (value instanceof Uint8Array) return value
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    if (Array.isArray(value)) return new Uint8Array(value)
    if (typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) return base58Bytes(value)
    return new Uint8Array()
  }

  function base58Bytes(value) {
    const bytes = []
    for (const character of value) {
      const alphabetIndex = BASE58_ALPHABET.indexOf(character)
      if (alphabetIndex < 0) return new Uint8Array()
      let carry = alphabetIndex
      for (let index = 0; index < bytes.length; index += 1) {
        const next = bytes[index] * 58 + carry
        bytes[index] = next & 0xff
        carry = next >> 8
      }
      while (carry > 0) {
        bytes.push(carry & 0xff)
        carry >>= 8
      }
    }
    for (let index = 0; index < value.length && value[index] === "1"; index += 1) {
      bytes.push(0)
    }
    return new Uint8Array(bytes.reverse())
  }

  function knownSolanaInstruction(programId, data) {
    const opcode = data[0]
    if (programId === "11111111111111111111111111111111" && data.length >= 4) {
      const systemInstruction = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)
      if (systemInstruction === 2) return "transfer"
    }
    if (programId === SPL_TOKEN_PROGRAM_ID || programId === TOKEN_2022_PROGRAM_ID) {
      return ({
        3: "transfer",
        4: "approve",
        6: "setAuthority",
        7: "mintTo",
        9: "closeAccount",
        12: "transferChecked",
        13: "approveChecked",
        14: "mintToChecked",
        15: "burnChecked",
        16: "syncNative",
      })[opcode]
    }
    return undefined
  }

  function solanaInstructionSummary(instruction, staticAccountKeys) {
    const programId = addressText(instruction?.programId) || addressText(staticAccountKeys?.[instruction?.programIdIndex])
    const data = instructionBytes(instruction?.data)
    const type = knownSolanaInstruction(programId, data)
    return {
      programId,
      programLabel: SOLANA_PROGRAM_LABELS[programId] ?? "Unknown Solana program",
      ...(type ? { type } : {}),
      keyCount: Array.isArray(instruction?.keys) ? instruction.keys.length : Array.isArray(instruction?.accountKeyIndexes) ? instruction.accountKeyIndexes.length : 0,
      dataLength: data.length,
    }
  }

  function solanaRequestSummary(method, transaction) {
    const transactions = Array.isArray(transaction) ? transaction : [transaction]
    const instructions = transactions.flatMap((item) => {
      const source = Array.isArray(item?.instructions) ? item.instructions : item?.message?.compiledInstructions
      const staticAccountKeys = item?.message?.staticAccountKeys ?? item?.message?.accountKeys
      return Array.isArray(source) ? source.slice(0, 16).map((instruction) => solanaInstructionSummary(instruction, staticAccountKeys)) : []
    })
    return {
      kind: "solana_wallet_request",
      method,
      transactionCount: transactions.length,
      instructionCount: instructions.length,
      instructions,
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
    if (chain === "solana") {
      const serialized = serializeTransactionLike(transaction)
      if (/signmessage/i.test(method)) return JSON.stringify({ method, message: serialized })
      return JSON.stringify({ ...solanaRequestSummary(method, transaction), serializedTransaction: serialized })
    }
    const requestParams = transaction && typeof transaction === "object" && !Array.isArray(transaction) && Array.isArray(transaction.params)
      ? transaction.params
      : Array.isArray(transaction) ? transaction : [transaction]
    return JSON.stringify({
      kind: "evm_wallet_request",
      method,
      params: requestParams,
    }, (_key, item) => {
      if (typeof item === "bigint") return item.toString()
      if (item instanceof Uint8Array) return `[Uint8Array:${item.length}]`
      return item
    })
  }

  function padEvmAddress(value) {
    const normalized = String(value ?? "").toLowerCase().replace(/^0x/, "")
    return /^[0-9a-f]{40}$/.test(normalized) ? normalized.padStart(64, "0") : ""
  }

  function hexQuantity(value) {
    try {
      return BigInt(value ?? "0x0").toString()
    } catch {
      return "0"
    }
  }

  async function inspectEvmPermissions(candidates) {
    const provider = evmProviders()[0]
    if (!provider) throw new Error("No EVM wallet provider was detected on this page.")
    const accounts = await provider.request({ method: "eth_accounts" })
    const owner = Array.isArray(accounts) ? accounts.find((item) => /^0x[0-9a-f]{40}$/i.test(String(item))) : null
    if (!owner) throw new Error("Connect your EVM wallet to this dApp before checking permissions.")
    const chainId = await provider.request({ method: "eth_chainId" }).catch(() => "unknown")
    const rows = Array.isArray(candidates) ? candidates : []
    const checks = rows
      .filter((row) => /^0x[0-9a-f]{40}$/i.test(String(row?.token)) && /^0x[0-9a-f]{40}$/i.test(String(row?.spender)))
      .slice(0, 30)
    const ownerPart = padEvmAddress(owner)
    const permissions = []
    for (const row of checks) {
      const calldata = `0xdd62ed3e${ownerPart}${padEvmAddress(row.spender)}`
      try {
        const allowance = await provider.request({ method: "eth_call", params: [{ to: row.token, data: calldata }, "latest"] })
        const amount = hexQuantity(allowance)
        if (BigInt(amount) > 0n) {
          permissions.push({
            token: row.token,
            spender: row.spender,
            amount,
            unlimited: BigInt(amount) > (2n ** 255n),
            source: row.source ?? "Observed approval request",
            status: "active_onchain",
          })
        }
      } catch {
        // A non-standard token or disconnected RPC cannot be treated as an active approval.
      }
    }
    return {
      chain: "evm",
      wallet: owner,
      network: String(chainId),
      checked: checks.length,
      permissions,
      note: checks.length
        ? "ScamGuard rechecked approval requests it observed in this browser through the connected wallet's RPC. Amounts are raw token units."
        : "No compatible ERC-20 approval request has been observed in this browser yet. Sign-in or site reads are not token permissions.",
    }
  }

  async function solanaRpc(endpoint, method, params) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "scamguard-permissions", method, params }),
    })
    const body = await response.json()
    if (!response.ok || body?.error) throw new Error(body?.error?.message ?? "Solana RPC request failed.")
    return body.result
  }

  async function inspectSolanaPermissions() {
    const provider = solanaProviders().find((item) => publicKey(item, "solana"))
    const wallet = publicKey(provider, "solana")
    if (!provider || !wallet) throw new Error("Connect your Solana wallet to this dApp before checking token delegates.")
    const endpoint = provider?.connection?.rpcEndpoint || "https://api.mainnet-beta.solana.com"
    const programs = [SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]
    const accounts = []
    for (const programId of programs) {
      const result = await solanaRpc(endpoint, "getTokenAccountsByOwner", [wallet, { programId }, { encoding: "jsonParsed" }])
      accounts.push(...(result?.value ?? []))
    }
    const permissions = accounts.flatMap((entry) => {
      const info = entry?.account?.data?.parsed?.info
      if (!info?.delegate) return []
      const amount = info?.delegatedAmount?.amount ?? info?.tokenAmount?.amount ?? "unknown"
      return [{
        tokenAccount: entry?.pubkey ?? "Unknown token account",
        mint: info.mint ?? "Unknown mint",
        delegate: info.delegate,
        amount: String(amount),
        status: "active_onchain_delegate",
      }]
    })
    return {
      chain: "solana",
      wallet,
      network: endpoint.includes("devnet") ? "devnet" : endpoint.includes("testnet") ? "testnet" : "mainnet-beta",
      checked: accounts.length,
      permissions,
      note: "ScamGuard read active SPL Token and Token-2022 delegates from token accounts owned by this connected wallet. Amounts are raw token units.",
    }
  }

  async function inspectWalletPermissions(candidates) {
    const outcomes = await Promise.allSettled([
      inspectEvmPermissions(candidates),
      inspectSolanaPermissions(),
    ])
    const inventories = outcomes.filter((outcome) => outcome.status === "fulfilled").map((outcome) => outcome.value)
    if (!inventories.length) {
      const message = outcomes.map((outcome) => outcome.status === "rejected" ? outcome.reason?.message : "").filter(Boolean).join(" ")
      throw new Error(message || "No connected wallet could be inspected on this page.")
    }
    return { inventories }
  }

  function handleBridgeMessage(event) {
    const data = event?.data
    if (!data || data.source !== EXTENSION_SOURCE) return
    if (data.type === "SCAMGUARD_PERMISSION_INVENTORY_REQUEST") {
      void inspectWalletPermissions(data.candidates)
        .then((inventory) => bridgePort?.postMessage({ source: PAGE_SOURCE, type: "SCAMGUARD_PERMISSION_INVENTORY_RESPONSE", requestId: data.requestId, ok: true, inventory }))
        .catch((error) => bridgePort?.postMessage({ source: PAGE_SOURCE, type: "SCAMGUARD_PERMISSION_INVENTORY_RESPONSE", requestId: data.requestId, ok: false, error: error instanceof Error ? error.message : "Permission check failed." }))
      return
    }
    if (data.type !== "SCAMGUARD_SIGN_RESPONSE") return
    const entry = pending.get(data.requestId)
    if (!entry) return
    window.clearTimeout(entry.timeout)
    pending.delete(data.requestId)
    entry.resolve(data)
  }

  function acceptPrivateBridge(event) {
    if (bridgePort || event.source !== window) return
    const data = event.data
    const port = event.ports?.[0]
    if (!data || data.source !== EXTENSION_SOURCE || data.type !== BRIDGE_INIT_TYPE || data.version !== 1 || !port) return
    bridgePort = port
    bridgePort.onmessage = handleBridgeMessage
    bridgePort.start?.()
    window.removeEventListener("message", acceptPrivateBridge, true)
    resolveBridgeReady?.(bridgePort)
  }

  window.addEventListener("message", acceptPrivateBridge, true)

  async function waitForBridge() {
    if (bridgePort) return bridgePort
    return Promise.race([
      bridgeReady,
      new Promise((resolve) => window.setTimeout(() => resolve(null), 3000)),
    ])
  }

  async function askScamGuard({ method, transaction, provider, chain }) {
    const port = await waitForBridge()
    if (!port) {
      return { allow: false, error: "ScamGuard private security bridge is unavailable. Reload this page before signing." }
    }

    const requestId = crypto.randomUUID()
    const value = serializedScanValue(method, transaction, chain)
    port.postMessage({
      source: PAGE_SOURCE,
      type: "SCAMGUARD_SIGN_REQUEST",
      requestId,
      method,
      chain,
      value,
      walletAddress: publicKey(provider, chain),
    })

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        pending.delete(requestId)
        resolve({ allow: false, error: "ScamGuard timed out before signing." })
      }, 30_000)
      pending.set(requestId, { resolve, timeout })
    })
  }

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
