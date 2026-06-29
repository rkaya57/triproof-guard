"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

type Network = {
  id: "base" | "polygon"
  label: string
  treasuryAddress?: string
}

type Plan = {
  id: string
  name: string
  amount: string
  wallets: string
}

export function CheckoutForm({ plan, networks }: { plan: Plan; networks: Network[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const availableNetworks = networks.filter((network) => network.treasuryAddress)
  const [network, setNetwork] = useState<"base" | "polygon">(
    availableNetworks[0]?.id ?? "base"
  )
  const [txHash, setTxHash] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const selectedNetwork = networks.find((item) => item.id === network)

  async function copyAddress() {
    if (!selectedNetwork?.treasuryAddress) return
    await navigator.clipboard.writeText(selectedNetwork.treasuryAddress)
    toast("Treasury address copied", "success")
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSuccess("")
    setPending(true)

    try {
      const response = await fetch("/api/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id, network, txHash }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        message?: string
      }

      if (!response.ok || !body.ok) {
        setError(body.error ?? "Verification failed.")
        return
      }

      setSuccess(body.message ?? "USDC payment verified. Analysis credits are active.")
      toast("USDC payment verified", "success")
      setTimeout(() => router.push("/dashboard/new-analysis"), 900)
    } catch {
      setError("Verification failed. Please try again.")
    } finally {
      setPending(false)
    }
  }

  if (!availableNetworks.length) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Treasury wallet addresses are not configured yet. Add TRIPROOF_TREASURY_BASE_ADDRESS
          or TRIPROOF_TREASURY_POLYGON_ADDRESS in Vercel Environment Variables.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-xs text-muted-foreground">Network</p>
          <select
            value={network}
            onChange={(event) => setNetwork(event.target.value as "base" | "polygon")}
            className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {availableNetworks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-xs text-muted-foreground">Required amount</p>
          <p className="mt-2 text-2xl font-semibold">{plan.amount} USDC</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-medium">Send USDC to this treasury address</p>
          <Button type="button" variant="outline" size="sm" onClick={copyAddress}>
            <Copy data-icon="inline-start" /> Copy
          </Button>
        </div>
        <code className="block overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">
          {selectedNetwork?.treasuryAddress}
        </code>
        <p className="mt-3 text-sm text-muted-foreground">
          Send exactly {plan.amount} USDC or more on {selectedNetwork?.label}. Then paste the
          transaction hash below. The system will verify the USDC transfer on-chain.
        </p>
      </div>

      <div>
        <label htmlFor="txHash" className="text-sm font-medium">
          Transaction hash
        </label>
        <Input
          id="txHash"
          value={txHash}
          onChange={(event) => setTxHash(event.target.value)}
          placeholder="0x..."
          className="mt-2"
        />
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
        <Button type="submit" disabled={pending || !txHash.trim()}>
          {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ShieldCheck data-icon="inline-start" />}
          Verify USDC Payment
        </Button>
        <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>
          Back to Pricing
        </Link>
      </div>
    </form>
  )
}
