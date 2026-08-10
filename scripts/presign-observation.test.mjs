import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import vm from "node:vm"

const source = readFileSync(join(process.cwd(), "chrome-extension", "src", "presign-observation.js"), "utf8")

function loadObservationApi() {
  const context = vm.createContext({
    globalThis: {},
    Uint8Array,
    ArrayBuffer,
    TextEncoder,
    JSON,
    Object,
    Array,
    Set,
    String,
  })
  vm.runInContext(source, context, { filename: "presign-observation.js" })
  return context.globalThis.ScamGuardPreSignObservation
}

test("pre-sign observation redacts arbitrary message and typed-data content", () => {
  const api = loadObservationApi()
  const privateText = "correct horse battery staple seed phrase should never leave the page"
  const observation = api.createObservation({
    method: "eth_signTypedData_v4",
    chain: "evm",
    origin: "https://app.example",
    payload: {
      domain: { name: "Example" },
      message: { note: privateText, recipient: "0x1111111111111111111111111111111111111111" },
      privateKey: "0xdeadbeef",
    },
  })

  const serialized = JSON.stringify(observation)
  assert.equal(observation.rawPayloadStored, false)
  assert.equal(observation.highImpact, true)
  assert.equal(observation.category, "signature")
  assert.equal(observation.privacy.typedDataBody, "redacted")
  assert.ok(!serialized.includes(privateText))
  assert.ok(!serialized.includes("0xdeadbeef"))
})

test("pre-sign observation keeps bounded public targets and payload size without raw transaction bytes", () => {
  const api = loadObservationApi()
  const target = "0x2222222222222222222222222222222222222222"
  const rawCalldata = `0x095ea7b3${"f".repeat(128)}`
  const observation = api.createObservation({
    method: "eth_sendTransaction",
    chain: "evm",
    origin: "https://dex.example/swap",
    payload: { to: target, data: rawCalldata, value: "0x0" },
  })

  const serialized = JSON.stringify(observation)
  assert.equal(observation.category, "transaction")
  assert.equal(observation.highImpact, true)
  assert.ok(observation.targets.includes(target))
  assert.ok(observation.payloadBytes > 0)
  assert.ok(!serialized.includes(rawCalldata))
})

test("pre-sign observation never exposes serialized Solana transaction bodies", () => {
  const api = loadObservationApi()
  const rawTransaction = "AQIDBAUGBwgJCgsMDQ4PEA=="
  const observation = api.createObservation({
    method: "signTransaction",
    chain: "solana",
    origin: "https://claim.example",
    payload: {
      serializedTransaction: rawTransaction,
      programId: "11111111111111111111111111111111",
    },
  })

  const serialized = JSON.stringify(observation)
  assert.equal(observation.privacy.serializedTransaction, "redacted")
  assert.ok(!serialized.includes(rawTransaction))
})
