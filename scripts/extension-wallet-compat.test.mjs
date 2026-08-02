import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import test from "node:test"
import vm from "node:vm"

const injectedSource = readFileSync(join(process.cwd(), "chrome-extension", "src", "injected.js"), "utf8")

function walletLab({ decision = { allow: true }, solana, ethereum, extraWindow = {} } = {}) {
  const listeners = []
  const pageMessages = []
  const intervalCallbacks = []
  const pageWindow = {
    solana,
    ethereum,
    ...extraWindow,
    addEventListener(type, listener) {
      if (type === "message") listeners.push(listener)
    },
    postMessage(message) {
      pageMessages.push(message)
      if (message?.source !== "SCAMGUARD_PAGE" || message?.type !== "SCAMGUARD_SIGN_REQUEST") return
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({
            source: pageWindow,
            data: {
              source: "SCAMGUARD_EXTENSION",
              type: "SCAMGUARD_SIGN_RESPONSE",
              requestId: message.requestId,
              ...decision,
            },
          })
        }
      })
    },
    setInterval(callback) {
      intervalCallbacks.push(callback)
      return intervalCallbacks.length
    },
    clearInterval() {},
    setTimeout,
    clearTimeout,
  }
  const context = vm.createContext({
    window: pageWindow,
    crypto: { randomUUID },
    ArrayBuffer,
    Uint8Array,
    JSON,
    String,
    Array,
    Object,
    Set,
    Promise,
    Error,
    queueMicrotask,
    btoa: (value) => Buffer.from(String(value), "binary").toString("base64"),
  })
  vm.runInContext(injectedSource, context, { filename: "injected.js" })

  return { pageMessages, pageWindow, intervalCallbacks, runAgain: () => vm.runInContext(injectedSource, context, { filename: "injected.js" }) }
}

function solanaProvider(methods = {}) {
  const calls = []
  const provider = {
    publicKey: { toString: () => "So11111111111111111111111111111111111111112" },
    ...methods,
  }
  for (const method of ["signTransaction", "signAndSendTransaction", "signAllTransactions", "signMessage"]) {
    provider[method] ??= async function originalSolanaMethod(...args) {
      calls.push({ method, args, receiver: this })
      return { method, args }
    }
  }
  return { provider, calls }
}

function evmProvider(label) {
  const calls = []
  return {
    selectedAddress: "0x1111111111111111111111111111111111111111",
    calls,
    async request(args) {
      calls.push({ args, receiver: this })
      return `${label}:${args.method}`
    },
  }
}

test("Solana signMessage is reviewed and reaches the original provider once", async () => {
  const { provider, calls } = solanaProvider()
  const lab = walletLab({ solana: provider })

  const result = await provider.signMessage(new Uint8Array([1, 2, 3]))

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, "signMessage")
  assert.equal(calls[0].receiver, provider)
  assert.equal(result.method, "signMessage")
  assert.equal(lab.pageMessages.length, 1)
  assert.equal(lab.pageMessages[0].method, "signMessage")
  assert.match(lab.pageMessages[0].value, /signMessage/)
})

test("a rejected ScamGuard decision prevents the Solana wallet request", async () => {
  const { provider, calls } = solanaProvider()
  const lab = walletLab({ solana: provider, decision: { allow: false, error: "User cancelled review" } })

  await assert.rejects(provider.signTransaction({ instruction: "transfer" }), /User cancelled review/)

  assert.equal(calls.length, 0)
  assert.equal(lab.pageMessages.length, 1)
})

test("Solana transaction summaries retain an actionable instruction label instead of raw payload text", async () => {
  const { provider } = solanaProvider()
  const lab = walletLab({ solana: provider })
  const transaction = {
    instructions: [{
      programId: { toBase58: () => "11111111111111111111111111111111" },
      keys: [{}, {}],
      data: new Uint8Array([2, 0, 0, 0]),
    }],
    serialize: () => new Uint8Array(96),
  }

  await provider.signTransaction(transaction)
  const summary = JSON.parse(lab.pageMessages[0].value)

  assert.equal(summary.method, "signTransaction")
  assert.equal(summary.instructions[0].programLabel, "System Program")
  assert.equal(summary.instructions[0].type, "transfer")
  assert.ok(summary.serializedTransaction.length > 80)
})

test("Solana compiled instructions decode Base58 program data when wallet adapters expose versioned messages", async () => {
  const { provider } = solanaProvider()
  const lab = walletLab({ solana: provider })
  const transaction = {
    message: {
      staticAccountKeys: [{ toBase58: () => "11111111111111111111111111111111" }],
      compiledInstructions: [{
        programIdIndex: 0,
        accountKeyIndexes: [1, 2],
        data: "3xyZh",
      }],
    },
    serialize: () => new Uint8Array(96),
  }

  await provider.signAndSendTransaction(transaction)
  const summary = JSON.parse(lab.pageMessages[0].value)

  assert.equal(summary.instructions[0].programLabel, "System Program")
  assert.equal(summary.instructions[0].type, "transfer")
})

test("discovers MetaMask and Rabby style providers without touching safe EVM reads", async () => {
  const metaMask = evmProvider("metamask")
  const rabby = evmProvider("rabby")
  const lab = walletLab({ ethereum: { providers: [metaMask, rabby] } })

  assert.equal(await metaMask.request({ method: "eth_chainId" }), "metamask:eth_chainId")
  assert.equal(lab.pageMessages.length, 0)

  assert.equal(await rabby.request({ method: "eth_sign", params: ["0x01", "hello"] }), "rabby:eth_sign")
  assert.equal(rabby.calls.length, 1)
  assert.equal(rabby.calls[0].receiver, rabby)
  assert.equal(lab.pageMessages.length, 1)
  assert.equal(lab.pageMessages[0].chain, "evm")
  assert.equal(lab.pageMessages[0].method, "eth_sign")
})

test("covers EVM transaction, typed-data, chain, and batched-call approval paths once", async () => {
  const provider = evmProvider("wallet")
  const lab = walletLab({ ethereum: provider })

  lab.runAgain()
  const methods = ["eth_sendTransaction", "eth_signTypedData_v4", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_sendCalls"]
  for (const method of methods) {
    assert.equal(await provider.request({ method, params: [] }), `wallet:${method}`)
  }

  assert.equal(provider.calls.length, methods.length)
  assert.equal(lab.pageMessages.length, methods.length)
  assert.deepEqual(lab.pageMessages.map((message) => message.method), methods)
})

test("preserves Wallet Call API batches for the ScamGuard risk ledger", async () => {
  const provider = evmProvider("wallet")
  const lab = walletLab({ ethereum: provider })
  const calls = [
    { to: "0x1111111111111111111111111111111111111111", data: "0x095ea7b3" },
    { to: "0x2222222222222222222222222222222222222222", value: "0x1" },
  ]

  await provider.request({
    method: "wallet_sendCalls",
    params: [{ version: "2.0.0", atomicRequired: true, calls }],
  })

  const payload = JSON.parse(lab.pageMessages[0].value)
  assert.deepEqual(payload, {
    kind: "evm_wallet_request",
    method: "wallet_sendCalls",
    params: [{ version: "2.0.0", atomicRequired: true, calls }],
  })
})
