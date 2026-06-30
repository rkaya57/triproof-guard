"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react"

import { paySolanaUsdcWithWallet } from "@/lib/billing/solana-wallet-client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

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
  error?: string
  message?: string
}

export function CheckoutForm({ plan, networks }: { plan: Plan; networks: Network[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const solanaNetwork = networks.find((network) => network.id === "solana" && network.treasuryAddress)
  const [txSignature, setTxSignature] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function verifyPayment(signature: string) {
    const response = await fetch("/api/billing/verify-solana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: plan.id, txHash: signature }),
    })
    const body = (await response.json().catch(() => ({}))) as VerifyResponse

    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "Payment verification failed.")
    }

    setSuccess(body.message ?? "Solana USDC payment verified. Analysis credits are active.")
    setError("")
    toast("Solana USDC payment verified", "success")
    setTimeout(() => router.push("/dashboard/new-analysis"), 900)
  }

  async function payWithWallet() {
    if (!solanaNetwork?.treasuryAddress) return

    setPending(true)
    setError("")
    setSuccess("")

    try {
      const payment = await paySolanaUsdcWithWallet({
        treasuryAddress: solanaNetwork.treasuryAddress,
        amountUsdc: plan.amount,
        reference: solanaNetwork.treasuryAddress,
      })
      setTxSignature(payment.signature)
      await verifyPayment(payment.signature)
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Wallet payment failed. Install or unlock Phantom/Solflare and try again."
      )
    } finally {
      setPending(false)
    }
  }

  async function copyAddress() {
    if (!solanaNetwork?.treasuryAddress) return
    await navigator.clipboard.writeText(solanaNetwork.treasuryAddress)
    toast("Solana treasury address copied", "success")
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
          <p className="mt-2 text-lg font-semibold">Solana USDC</p>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-xs text-muted-foreground">Required amount</p>
          <p className="mt-2 text-2xl font-semibold">{plan.amount} USDC</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-medium">Wallet checkout</p>
          <Button type="button" variant="outline" size="sm" onClick={copyAddress}>
            <Copy data-icon="inline-start" /> Copy Address
          </Button>
        </div>
        <code className="block overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">
          {solanaNetwork.treasuryAddress}
        </code>
        <p className="mt-3 text-sm text-muted-foreground">
          Click Open Wallet & Pay. Phantom or Solflare will open a transaction popup. Approve {plan.amount} USDC and Tri-Proof will verify the payment automatically.
        </p>
        {txSignature && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Transaction: {txSignature}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={payWithWallet} disabled={pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ExternalLink data-icon="inline-start" />}
            Open Wallet & Pay
          </Button>
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
