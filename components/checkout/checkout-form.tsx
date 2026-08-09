"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BadgeCheck, CheckCircle2, CircleDollarSign, Clock3, Copy, ExternalLink, Loader2, ShieldCheck, WalletCards } from "lucide-react"

import { paySolanaSolWithWallet, paySolanaUsdcWithWallet } from "@/lib/billing/solana-wallet-client"
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
  purchaseKind?: "subscription" | "credits"
}

type VerifyResponse = {
  ok?: boolean
  error?: string
  message?: string
}

type CheckoutIntent = {
  currency: "USDC" | "SOL"
  amountUsdc: number
  amountSol: number | null
  solUsdPrice: number | null
  expiresAt: string
  reference: string
  intent: string
}

export function CheckoutForm({ plan, networks }: { plan: Plan; networks: Network[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const solanaNetwork = networks.find((network) => network.id === "solana" && network.treasuryAddress)
  const [txSignature, setTxSignature] = useState("")
  const [currency, setCurrency] = useState<"USDC" | "SOL">("USDC")
  const [paymentIntent, setPaymentIntent] = useState<CheckoutIntent | null>(null)
  const [intentPending, setIntentPending] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function loadPaymentIntent(paymentCurrency: "USDC" | "SOL") {
    setIntentPending(true)
    setError("")
    try {
      const response = await fetch("/api/billing/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(plan.purchaseKind === "credits" ? { pack: plan.id } : { plan: plan.id }),
          currency: paymentCurrency,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as CheckoutIntent & { error?: string }
      if (!response.ok || !body.intent || !body.reference || body.currency !== paymentCurrency) {
        throw new Error(body.error ?? "Could not prepare a secure payment intent.")
      }
      setPaymentIntent(body)
      return body
    } catch (intentError) {
      setPaymentIntent(null)
      const message = intentError instanceof Error ? intentError.message : "Could not prepare a secure payment intent."
      setError(message)
      throw intentError
    } finally {
      setIntentPending(false)
    }
  }

  function chooseCurrency(nextCurrency: "USDC" | "SOL") {
    setCurrency(nextCurrency)
    setError("")
    setPaymentIntent(null)
    if (nextCurrency === "SOL") void loadPaymentIntent("SOL").catch(() => undefined)
  }

  async function verifyPayment(signature: string, intent: CheckoutIntent) {
    const response = await fetch("/api/billing/verify-solana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(plan.purchaseKind === "credits" ? { pack: plan.id } : { plan: plan.id }),
        txHash: signature,
        currency: intent.currency,
        intent: intent.intent,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as VerifyResponse

    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "Payment verification failed.")
    }

    setSuccess(body.message ?? `Solana ${intent.currency} payment verified.`)
    setError("")
    toast(`Solana ${intent.currency} payment verified`, "success")
    setTimeout(() => router.push("/dashboard/new-analysis"), 900)
  }

  async function payWithWallet() {
    if (!solanaNetwork?.treasuryAddress) return

    setPending(true)
    setError("")
    setSuccess("")

    try {
      const reusableIntent =
        paymentIntent &&
        paymentIntent.currency === currency &&
        Date.parse(paymentIntent.expiresAt) > Date.now() + 5_000
          ? paymentIntent
          : null
      const intent = reusableIntent ?? await loadPaymentIntent(currency)

      const payment =
        currency === "SOL"
          ? await paySolanaSolWithWallet({
              treasuryAddress: solanaNetwork.treasuryAddress,
              amountSol: intent.amountSol ?? 0,
              reference: intent.reference,
            })
          : await paySolanaUsdcWithWallet({
              treasuryAddress: solanaNetwork.treasuryAddress,
              amountUsdc: plan.amount,
              reference: intent.reference,
            })
      setTxSignature(payment.signature)
      await verifyPayment(payment.signature, intent)
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
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Payment network</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold"><BadgeCheck className="size-4 text-primary" /> Solana mainnet</p>
          <p className="mt-1 text-xs text-muted-foreground">USDC or native SOL</p>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Selected settlement</p>
          <p className="mt-2 text-2xl font-semibold">
            {currency === "SOL" && paymentIntent?.amountSol ? `${paymentIntent.amountSol.toFixed(6)} SOL` : `${plan.amount} USDC`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{currency === "SOL" ? "Signed live quote for this checkout" : plan.purchaseKind === "credits" ? "Fixed Sybil credit-pack denomination" : "Fixed plan denomination"}</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div><p className="font-medium">Choose your settlement asset</p><p className="mt-1 text-xs text-muted-foreground">Every payment receives a short-lived, account-bound on-chain reference. Tri-Proof never takes custody.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={copyAddress}>
            <Copy data-icon="inline-start" /> Copy Address
          </Button>
        </div>
        <code className="block overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">
          {solanaNetwork.treasuryAddress}
        </code>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant={currency === "USDC" ? "default" : "outline"} className="justify-start" onClick={() => chooseCurrency("USDC")}>
            <CircleDollarSign data-icon="inline-start" /> Pay with USDC
          </Button>
          <Button type="button" variant={currency === "SOL" ? "default" : "outline"} className="justify-start" onClick={() => chooseCurrency("SOL")}>
            <WalletCards data-icon="inline-start" /> Pay with SOL
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {currency === "SOL"
            ? paymentIntent?.amountSol && paymentIntent.solUsdPrice
              ? `Locked quote: ${paymentIntent.amountSol.toFixed(6)} SOL at $${paymentIntent.solUsdPrice.toFixed(2)} per SOL. It expires ${new Date(paymentIntent.expiresAt).toLocaleTimeString()}.`
              : "Preparing a short-lived signed SOL checkout intent."
            : `Click Open Wallet & Pay. Phantom or Solflare will transfer ${plan.amount} USDC with a unique checkout reference and Tri-Proof will verify both automatically.`}
        </p>
        {txSignature && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Transaction: {txSignature}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="glow-primary" onClick={payWithWallet} disabled={pending || intentPending}>
            {pending || intentPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ExternalLink data-icon="inline-start" />}
            {intentPending ? "Preparing secure checkout" : `Open Wallet & Pay ${currency}`}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background/35 p-3"><ShieldCheck className="size-4 text-primary" /><p className="mt-2 text-xs font-medium">Self-custody</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">No card data or wallet custody.</p></div>
        <div className="rounded-lg border border-border bg-background/35 p-3"><BadgeCheck className="size-4 text-primary" /><p className="mt-2 text-xs font-medium">Intent-bound verification</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">The transaction must match your signed checkout reference.</p></div>
        <div className="rounded-lg border border-border bg-background/35 p-3"><Clock3 className="size-4 text-primary" /><p className="mt-2 text-xs font-medium">Short-lived intent</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">Checkout intents expire after 15 minutes.</p></div>
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
