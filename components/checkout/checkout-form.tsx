"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

const solanaUsdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

type Network = {
  id: "solana"
  label: string
  treasuryAddress?: string
}

type Plan = {
  id: string
  name: string
  amount: string
  wallets: string
}

type VerifyResponse = {
  ok?: boolean
  pending?: boolean
  error?: string
  message?: string
}

function encodeBase58(bytes: Uint8Array) {
  const digits = [0]

  for (const byte of bytes) {
    let carry = byte
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry
      digits[index] = value % 58
      carry = Math.floor(value / 58)
    }

    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }

  let output = ""
  for (const byte of bytes) {
    if (byte === 0) output += base58Alphabet[0]
    else break
  }

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += base58Alphabet[digits[index]]
  }

  return output
}

function generateSolanaReference() {
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return encodeBase58(bytes)
}

function buildSolanaPayUrl({
  treasuryAddress,
  amount,
  planName,
  wallets,
  reference,
}: {
  treasuryAddress: string
  amount: string
  planName: string
  wallets: string
  reference: string
}) {
  const params = new URLSearchParams({
    amount,
    "spl-token": solanaUsdcMint,
    label: "Tri-Proof Protocol",
    message: `${planName} plan - ${wallets} wallet credits`,
    reference,
  })

  return `solana:${treasuryAddress}?${params.toString()}`
}

export function CheckoutForm({ plan, networks }: { plan: Plan; networks: Network[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const solanaNetwork = networks.find((network) => network.id === "solana" && network.treasuryAddress)
  const [paymentReference, setPaymentReference] = useState("")
  const [paymentUrl, setPaymentUrl] = useState("")
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function verifyPayment(reference: string, showPendingError = false) {
    setChecking(true)

    try {
      const response = await fetch("/api/billing/verify-solana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id, reference }),
      })
      const body = (await response.json().catch(() => ({}))) as VerifyResponse

      if (response.ok && body.ok) {
        setSuccess(body.message ?? "Solana USDC payment verified. Analysis credits are active.")
        setError("")
        toast("Solana USDC payment verified", "success")
        setTimeout(() => router.push("/dashboard/new-analysis"), 900)
        return true
      }

      if (response.status === 202 || body.pending) {
        if (showPendingError) {
          setError("Payment is not visible on-chain yet. Approve it in your wallet, then click Check Payment again.")
        }
        return false
      }

      setError(body.error ?? "Payment verification failed.")
      return false
    } finally {
      setChecking(false)
    }
  }

  function openSolanaWallet() {
    if (!solanaNetwork?.treasuryAddress) return

    const reference = generateSolanaReference()
    const url = buildSolanaPayUrl({
      treasuryAddress: solanaNetwork.treasuryAddress,
      amount: plan.amount,
      planName: plan.name,
      wallets: plan.wallets,
      reference,
    })

    setPaymentReference(reference)
    setPaymentUrl(url)
    setError(
      "If Chrome does not open your wallet, copy the Pay Link and open it inside Phantom/Solflare. After approving the payment, click Check Payment."
    )
    setSuccess("")
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function copyAddress() {
    if (!solanaNetwork?.treasuryAddress) return
    await navigator.clipboard.writeText(solanaNetwork.treasuryAddress)
    toast("Solana treasury address copied", "success")
  }

  async function copySolanaPayLink() {
    if (!paymentUrl) return
    await navigator.clipboard.writeText(paymentUrl)
    toast("Solana Pay link copied", "success")
  }

  if (!solanaNetwork?.treasuryAddress) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Solana treasury wallet is not configured yet. Add TRIPROOF_TREASURY_SOLANA_ADDRESS in Vercel Environment Variables.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-xs text-muted-foreground">Payment network</p>
          <p className="mt-2 text-lg font-semibold">Solana Pay</p>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-xs text-muted-foreground">Required amount</p>
          <p className="mt-2 text-2xl font-semibold">{plan.amount} USDC</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-medium">One-click Solana Pay checkout</p>
          <Button type="button" variant="outline" size="sm" onClick={copyAddress}>
            <Copy data-icon="inline-start" /> Copy Address
          </Button>
        </div>
        <code className="block overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">
          {solanaNetwork.treasuryAddress}
        </code>
        <p className="mt-3 text-sm text-muted-foreground">
          Click Open Wallet & Pay, approve {plan.amount} USDC in your Solana wallet, then click Check Payment. Tri-Proof verifies it on-chain with a unique reference.
        </p>
        {paymentReference && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Payment reference: {paymentReference}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={openSolanaWallet}>
            <ExternalLink data-icon="inline-start" /> Open Wallet & Pay
          </Button>
          {paymentReference && (
            <Button type="button" variant="outline" onClick={() => void verifyPayment(paymentReference, true)} disabled={checking}>
              {checking ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ShieldCheck data-icon="inline-start" />}
              Check Payment
            </Button>
          )}
          {paymentUrl && (
            <Button type="button" variant="outline" onClick={copySolanaPayLink}>
              <Copy data-icon="inline-start" /> Copy Pay Link
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>
          Back to Pricing
        </Link>
      </div>
    </div>
  )
}
