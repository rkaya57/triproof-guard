import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import test from "node:test"
import vm from "node:vm"

const injectedSource = readFileSync(join(process.cwd(), "chrome-extension", "src", "injected.js"), "utf8")

class TestEvent {
  constructor(type) {
    this.type = type
  }
}

class TestCustomEvent extends TestEvent {
  constructor(type, options = {}) {
    super(type)
    this.detail = options.detail
  }
}

function portPair() {
  const left = { onmessage: null, start() {}, postMessage: null }
  const right = { onmessage: null, start() {}, postMessage: null }
  left.postMessage = (data) => queueMicrotask(() => right.onmessage?.({ data }))
  right.postMessage = (data) => queueMicrotask(() => left.onmessage?.({ data }))
  return [left, right]
}

function createEventWindow(initial = {}) {
  const listeners = new Map()
  const intervals = []
  const pageWindow = {
    ...initial,
    addEventListener(type, listener) {
      const bucket = listeners.get(type) ?? []
      bucket.push(listener)
      listeners.set(type, bucket)
    },
    removeEventListener(type, listener) {
      const bucket = listeners.get(type) ?? []
      listeners.set(type, bucket.filter((item) => item !== listener))
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event?.type) ?? [])]) listener.call(pageWindow, event)
      return true
    },
    postMessage() {},
    setInterval(callback, delay) {
      const entry = { callback, delay, active: true }
      intervals.push(entry)
      return intervals.length
    },
    clearInterval(id) {
      if (intervals[id - 1]) intervals[id - 1].active = false
    },
    setTimeout,
    clearTimeout,
  }
  return { pageWindow, listeners, intervals }
}

function compatibilityLab(initial = {}) {
  const { pageWindow, intervals } = createEventWindow(initial)
  const [pagePort, extensionPort] = portPair()
  const bridgeMessages = []

  extensionPort.onmessage = (event) => {
    const message = event.data
    bridgeMessages.push(message)
    if (message?.type !== "SCAMGUARD_SIGN_REQUEST") return
    queueMicrotask(() => extensionPort.postMessage({
      source: "SCAMGUARD_EXTENSION",
      type: "SCAMGUARD_SIGN_RESPONSE",
      requestId: message.requestId,
      allow: true,
    }))
  }

  const context = vm.createContext({
    window: pageWindow,
    Event: TestEvent,
    CustomEvent: TestCustomEvent,
    crypto: { randomUUID },
    ArrayBuffer,
    Uint8Array,
    JSON,
    String,
    Array,
    Object,
    Set,
    Map,
    WeakMap,
    Promise,
    BigInt,
    Error,
    Reflect,
    queueMicrotask,
    btoa: (value) => Buffer.from(String(value), "binary").toString("base64"),
    fetch: async () => ({ ok: true, json: async () => ({ result: { value: [] } }) }),
  })

  vm.runInContext(injectedSource, context, { filename: "injected.js" })
  pageWindow.dispatchEvent({
    type: "message",
    source: pageWindow,
    data: { source: "SCAMGUARD_EXTENSION", type: "SCAMGUARD_BRIDGE_INIT_V1", version: 1 },
    ports: [pagePort],
  })

  function reconcile() {
    for (const entry of intervals) {
      if (entry.active) entry.callback()
    }
  }

  return { pageWindow, extensionPort, bridgeMessages, reconcile, intervals }
}

function evmProvider(label, { accounts = ["0x1111111111111111111111111111111111111111"] } = {}) {
  const calls = []
  return {
    calls,
    selectedAddress: accounts[0] ?? null,
    async request(args) {
      calls.push(args)
      if (args.method === "eth_accounts") return accounts
      if (args.method === "eth_chainId") return "0x1"
      if (args.method === "eth_call") return "0x1"
      return `${label}:${args.method}`
    },
  }
}

test("EIP-6963 providers announced after page load are protected immediately", async () => {
  const lab = compatibilityLab()
  const provider = evmProvider("eip6963")

  lab.pageWindow.dispatchEvent(new TestCustomEvent("eip6963:announceProvider", {
    detail: Object.freeze({
      info: Object.freeze({ uuid: randomUUID(), name: "Late Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.example.wallet" }),
      provider,
    }),
  }))

  const result = await provider.request({ method: "eth_sendTransaction", params: [{ to: "0x2222222222222222222222222222222222222222" }] })

  assert.equal(result, "eip6963:eth_sendTransaction")
  assert.equal(lab.bridgeMessages.filter((message) => message?.type === "SCAMGUARD_SIGN_REQUEST").length, 1)
  assert.equal(lab.bridgeMessages.at(-1).chain, "evm")
})

test("a legacy provider replacement is reconciled after the original page load", async () => {
  const first = evmProvider("first")
  const lab = compatibilityLab({ ethereum: first })
  await first.request({ method: "eth_sign", params: [first.selectedAddress, "0x01"] })

  const replacement = evmProvider("replacement")
  lab.pageWindow.ethereum = replacement
  lab.reconcile()

  const result = await replacement.request({ method: "eth_signTypedData_v4", params: [replacement.selectedAddress, "{}"] })
  assert.equal(result, "replacement:eth_signTypedData_v4")
  assert.equal(lab.bridgeMessages.filter((message) => message?.type === "SCAMGUARD_SIGN_REQUEST").length, 2)
})

test("an unpatchable frozen provider does not crash discovery or poison a later replacement", async () => {
  const frozen = Object.freeze({
    selectedAddress: "0x1111111111111111111111111111111111111111",
    request: async ({ method }) => `frozen:${method}`,
  })
  const lab = compatibilityLab({ ethereum: frozen })

  assert.equal(await frozen.request({ method: "eth_chainId" }), "frozen:eth_chainId")

  const replacement = evmProvider("mutable")
  lab.pageWindow.ethereum = replacement
  lab.reconcile()
  assert.equal(await replacement.request({ method: "eth_sendTransaction", params: [] }), "mutable:eth_sendTransaction")
  assert.equal(lab.bridgeMessages.filter((message) => message?.type === "SCAMGUARD_SIGN_REQUEST").length, 1)
})

test("Solana Wallet Standard registrations are guarded without relying on window.solana", async () => {
  const lab = compatibilityLab()
  const calls = []
  const feature = {
    async signMessage(...inputs) {
      calls.push(inputs)
      return [{ signedMessage: new Uint8Array([9, 9]) }]
    },
  }
  const wallet = {
    version: "1.0.0",
    name: "Standard Wallet",
    icon: "data:image/svg+xml,<svg/>",
    chains: ["solana:mainnet"],
    accounts: [{ address: "So11111111111111111111111111111111111111112", chains: ["solana:mainnet"], features: ["solana:signMessage"], publicKey: new Uint8Array(32) }],
    features: { "solana:signMessage": feature },
  }

  lab.pageWindow.dispatchEvent(new TestCustomEvent("wallet-standard:register-wallet", {
    detail: ({ register }) => register(wallet),
  }))

  await feature.signMessage({ account: wallet.accounts[0], message: new Uint8Array([1, 2, 3]) })
  const request = lab.bridgeMessages.find((message) => message?.type === "SCAMGUARD_SIGN_REQUEST")
  const value = JSON.parse(request.value)

  assert.equal(calls.length, 1)
  assert.equal(request.chain, "solana")
  assert.equal(request.walletAddress, wallet.accounts[0].address)
  assert.equal(value.kind, "solana_wallet_standard_request")
  assert.equal(value.method, "signMessage")
  assert.ok(value.inputs[0].message)
})

test("permission inventory prefers a connected announced EVM provider over a disconnected root", async () => {
  const disconnected = evmProvider("disconnected", { accounts: [] })
  const connected = evmProvider("connected")
  const lab = compatibilityLab({ ethereum: disconnected })

  lab.pageWindow.dispatchEvent(new TestCustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: randomUUID(), name: "Connected Wallet", rdns: "com.connected.wallet" }, provider: connected },
  }))

  lab.extensionPort.postMessage({
    source: "SCAMGUARD_EXTENSION",
    type: "SCAMGUARD_PERMISSION_INVENTORY_REQUEST",
    requestId: "inventory-v2",
    candidates: [{
      token: "0x2222222222222222222222222222222222222222",
      spender: "0x3333333333333333333333333333333333333333",
      source: "test",
    }],
  })

  await new Promise((resolve) => setTimeout(resolve, 10))
  const response = lab.bridgeMessages.find((message) => message?.type === "SCAMGUARD_PERMISSION_INVENTORY_RESPONSE" && message.requestId === "inventory-v2")
  const evm = response?.inventory?.inventories?.find((item) => item.chain === "evm")

  assert.equal(response?.ok, true)
  assert.equal(evm?.wallet, connected.selectedAddress)
  assert.equal(evm?.permissions?.[0]?.status, "active_onchain")
  assert.equal(disconnected.calls.some((call) => call.method === "eth_accounts"), false)
  assert.ok(connected.calls.some((call) => call.method === "eth_accounts"))
  assert.ok(connected.calls.some((call) => call.method === "eth_call"))
})

test("modern discovery listeners and long-lived reconciliation remain present", () => {
  assert.match(injectedSource, /eip6963:announceProvider/)
  assert.match(injectedSource, /eip6963:requestProvider/)
  assert.match(injectedSource, /wallet-standard:register-wallet/)
  assert.match(injectedSource, /wallet-standard:app-ready/)
  assert.match(injectedSource, /window\.setInterval\(\(\) => \{\s*install\(\)\s*requestEip6963Providers\(\)\s*\}, 2000\)/)
  assert.match(injectedSource, /const methodRecords = new WeakMap\(\)/)
})
