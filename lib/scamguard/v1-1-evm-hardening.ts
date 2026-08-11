export type V11EvmIntentCategory = "transfer" | "approval" | "authority" | "unknown"

export type V11EvmDecodedIntent = {
  selector?: string
  method?: string
  category: V11EvmIntentCategory
  spender?: string
  recipient?: string
  contractTarget?: string
  amount?: string
  authorityTarget?: string
  highImpact: boolean
  reasonCodes: string[]
}

const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935"

const SELECTORS = new Map<string, { method: string; category: V11EvmIntentCategory }>([
  ["0xa9059cbb", { method: "transfer(address,uint256)", category: "transfer" }],
  ["0x23b872dd", { method: "transferFrom(address,address,uint256)", category: "transfer" }],
  ["0x095ea7b3", { method: "approve(address,uint256)", category: "approval" }],
  ["0xa22cb465", { method: "setApprovalForAll(address,bool)", category: "approval" }],
  ["0xd505accf", { method: "permit(...) ", category: "approval" }],
  ["0x3659cfe6", { method: "upgradeTo(address)", category: "authority" }],
  ["0x4f1ef286", { method: "upgradeToAndCall(address,bytes)", category: "authority" }],
  ["0xf2fde38b", { method: "transferOwnership(address)", category: "authority" }],
  ["0x8da5cb5b", { method: "owner()", category: "unknown" }],
])

function normalizeHex(data?: string) {
  if (!data) return undefined
  const normalized = data.trim().toLowerCase()
  if (!/^0x[0-9a-f]*$/.test(normalized) || normalized.length < 10) return undefined
  return normalized
}

function wordAt(data: string, index: number) {
  const start = 10 + index * 64
  const word = data.slice(start, start + 64)
  return word.length === 64 ? word : undefined
}

function addressFromWord(word?: string) {
  if (!word || !/^[0-9a-f]{64}$/.test(word)) return undefined
  return `0x${word.slice(24)}`
}

function uintFromWord(word?: string) {
  if (!word || !/^[0-9a-f]{64}$/.test(word)) return undefined
  try {
    return BigInt(`0x${word}`).toString(10)
  } catch {
    return undefined
  }
}

export function decodeV11EvmIntent(data?: string, rawTo?: string | null): V11EvmDecodedIntent {
  const normalized = normalizeHex(data)
  const contractTarget = rawTo?.toLowerCase()
  if (!normalized) {
    return {
      category: "unknown",
      contractTarget,
      highImpact: false,
      reasonCodes: contractTarget ? ["RAW_CONTRACT_TARGET_PRESENT"] : [],
    }
  }

  const selector = normalized.slice(0, 10)
  const descriptor = SELECTORS.get(selector)
  const first = wordAt(normalized, 0)
  const second = wordAt(normalized, 1)
  const third = wordAt(normalized, 2)

  if (selector === "0x095ea7b3") {
    const spender = addressFromWord(first)
    const amount = uintFromWord(second)
    return {
      selector,
      method: descriptor?.method,
      category: "approval",
      spender,
      contractTarget,
      amount,
      highImpact: amount === MAX_UINT256,
      reasonCodes: [amount === MAX_UINT256 ? "UNLIMITED_APPROVAL" : "TOKEN_APPROVAL"],
    }
  }

  if (selector === "0xa22cb465") {
    const spender = addressFromWord(first)
    const enabled = uintFromWord(second) === "1"
    return {
      selector,
      method: descriptor?.method,
      category: "approval",
      spender,
      contractTarget,
      amount: enabled ? "all assets" : "disabled",
      highImpact: enabled,
      reasonCodes: [enabled ? "OPERATOR_APPROVAL_ENABLED" : "OPERATOR_APPROVAL_DISABLED"],
    }
  }

  if (selector === "0xa9059cbb") {
    return {
      selector,
      method: descriptor?.method,
      category: "transfer",
      recipient: addressFromWord(first),
      contractTarget,
      amount: uintFromWord(second),
      highImpact: false,
      reasonCodes: ["TOKEN_TRANSFER"],
    }
  }

  if (selector === "0x23b872dd") {
    return {
      selector,
      method: descriptor?.method,
      category: "transfer",
      recipient: addressFromWord(second),
      contractTarget,
      amount: uintFromWord(third),
      highImpact: false,
      reasonCodes: ["TOKEN_TRANSFER_FROM"],
    }
  }

  if (selector === "0x3659cfe6" || selector === "0x4f1ef286") {
    const authorityTarget = addressFromWord(first)
    return {
      selector,
      method: descriptor?.method,
      category: "authority",
      authorityTarget,
      contractTarget,
      highImpact: true,
      reasonCodes: [selector === "0x3659cfe6" ? "PROXY_IMPLEMENTATION_CHANGE" : "PROXY_IMPLEMENTATION_CHANGE_AND_CALL"],
    }
  }

  if (selector === "0xf2fde38b") {
    const authorityTarget = addressFromWord(first)
    return {
      selector,
      method: descriptor?.method,
      category: "authority",
      authorityTarget,
      contractTarget,
      highImpact: true,
      reasonCodes: ["CONTRACT_OWNERSHIP_TRANSFER"],
    }
  }

  return {
    selector,
    method: descriptor?.method,
    category: descriptor?.category ?? "unknown",
    contractTarget,
    highImpact: false,
    reasonCodes: contractTarget ? ["RAW_CONTRACT_TARGET_PRESENT"] : [],
  }
}

export function v11CounterpartyCandidates(intent: V11EvmDecodedIntent) {
  return [...new Set([
    intent.spender,
    intent.recipient,
    intent.authorityTarget,
    intent.contractTarget,
  ].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))]
}

export function isV11HighImpactAuthorityIntent(intent: V11EvmDecodedIntent) {
  return intent.category === "authority" && intent.highImpact
}
