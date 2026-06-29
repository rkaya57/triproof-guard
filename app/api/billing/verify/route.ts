import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { attachAccessPassCookie } from "@/lib/billing/access-pass"

export const runtime = "nodejs"

const zeroBigInt = BigInt(0)
const usdcDecimals = BigInt(1_000_000)
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

const plans = {
  starter: { amountUsdc: 99, walletCredits: 1000 },
  growth: { amountUsdc: 249, walletCredits: 10000 },
  pro: { amountUsdc: 499, walletCredits: 50000 },
} as const

const networks = {
  base: {
    label: "Base",
    chainId: 8453,
    usdcContract:
      process.env.BASE_USDC_CONTRACT ??
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    treasury: process.env.TRIPROOF_TREASURY_BASE_ADDRESS,
  },
  polygon: {
    label: "Polygon",
    chainId: 137,
    usdcContract:
      process.env.POLYGON_USDC_CONTRACT ??
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    treasury: process.env.TRIPROOF_TREASURY_POLYGON_ADDRESS,
  },
} as const

type PlanId = keyof typeof plans
type NetworkId = keyof typeof networks

type ReceiptLog = {
  address?: string
  topics?: string[]
  data?: string
}

type Receipt = {
  status?: string
  blockNumber?: string
  logs?: ReceiptLog[]
}

function normalizeAddress(value: string | undefined | null) {
  return value?.toLowerCase() ?? ""
}

function topicAddress(topic: string | undefined) {
  if (!topic || !topic.startsWith("0x") || topic.length < 66) return ""
  return `0x${topic.slice(-40)}`.toLowerCase()
}

function parseHexBigInt(value: string | undefined) {
  if (!value || !value.startsWith("0x")) return zeroBigInt
  try {
    return BigInt(value)
  } catch {
    return zeroBigInt
  }
}

function unitsToUsdc(units: bigint) {
  return Number(units) / 1_000_000
}

async function etherscanProxy(chainId: number, action: string, params: Record<string, string>) {
  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY is not configured")
  }

  const search = new URLSearchParams({
    chainid: String(chainId),
    module: "proxy",
    action,
    apikey: apiKey,
    ...params,
  })

  const response = await fetch(`https://api.etherscan.io/v2/api?${search.toString()}`, {
    cache: "no-store",
  })
  const data = (await response.json()) as { result?: unknown; message?: string }

  if (!response.ok) {
    throw new Error(data.message || "Etherscan request failed")
  }

  return data.result
}

async function verifyTransfer({
  txHash,
  network,
  expectedAmountUsdc,
}: {
  txHash: string
  network: (typeof networks)[NetworkId]
  expectedAmountUsdc: number
}) {
  const receipt = (await etherscanProxy(network.chainId, "eth_getTransactionReceipt", {
    txhash: txHash,
  })) as Receipt | null

  if (!receipt) {
    return { ok: false as const, error: "Transaction was not found yet." }
  }

  if (receipt.status !== "0x1") {
    return { ok: false as const, error: "Transaction is not successful." }
  }

  const treasury = normalizeAddress(network.treasury)
  const usdcContract = normalizeAddress(network.usdcContract)
  const expectedUnits = BigInt(expectedAmountUsdc) * usdcDecimals

  const matchingLog = (receipt.logs ?? []).find((log) => {
    const topics = log.topics ?? []
    return (
      normalizeAddress(log.address) === usdcContract &&
      normalizeAddress(topics[0]) === transferTopic &&
      topicAddress(topics[2]) === treasury &&
      parseHexBigInt(log.data) >= expectedUnits
    )
  })

  if (!matchingLog) {
    return {
      ok: false as const,
      error: `No matching USDC transfer to the treasury wallet was found in this transaction.`,
    }
  }

  const latestBlockHex = (await etherscanProxy(network.chainId, "eth_blockNumber", {})) as string
  const txBlock = Number.parseInt(receipt.blockNumber ?? "0x0", 16)
  const latestBlock = Number.parseInt(latestBlockHex ?? "0x0", 16)
  const confirmations = txBlock > 0 && latestBlock >= txBlock ? latestBlock - txBlock + 1 : 0
  const requiredConfirmations = Number.parseInt(process.env.PAYMENT_CONFIRMATIONS ?? "1", 10)

  if (confirmations < requiredConfirmations) {
    return {
      ok: false as const,
      error: `Waiting for confirmations. Current: ${confirmations}, required: ${requiredConfirmations}.`,
    }
  }

  return {
    ok: true as const,
    receivedAmountUsdc: unitsToUsdc(parseHexBigInt(matchingLog.data)),
    confirmations,
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    plan?: string
    network?: string
    txHash?: string
  }

  const planId = body.plan as PlanId
  const networkId = body.network as NetworkId
  const plan = plans[planId]
  const network = networks[networkId]
  const txHash = String(body.txHash ?? "").trim()

  if (!plan) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 })
  }

  if (!network) {
    return NextResponse.json({ error: "Invalid network." }, { status: 400 })
  }

  if (!network.treasury) {
    return NextResponse.json(
      { error: `${network.label} treasury wallet is not configured.` },
      { status: 500 }
    )
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 })
  }

  try {
    const verification = await verifyTransfer({
      txHash,
      network,
      expectedAmountUsdc: plan.amountUsdc,
    })

    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: 400 })
    }

    const response = NextResponse.json({
      ok: true,
      plan: planId,
      network: networkId,
      txHash,
      amountUsdc: verification.receivedAmountUsdc,
      confirmations: verification.confirmations,
      walletCredits: plan.walletCredits,
      message: "USDC payment verified. Analysis credits are active for this browser session.",
    })

    await attachAccessPassCookie(response, {
      userId: user.id,
      plan: planId,
      txHash,
      network: networkId,
      walletCredits: plan.walletCredits,
      amountUsdc: verification.receivedAmountUsdc,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 500 }
    )
  }
}
