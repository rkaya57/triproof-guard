import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, BadgeCheck, FileCheck2, Layers3, ShieldCheck, WalletCards } from "lucide-react"

import { CheckoutForm } from "@/components/checkout/checkout-form"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { billingPlans, getBillingPlan, planForWalletCount } from "@/lib/billing/plans"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; requiredWallets?: string }>
}) {
  const params = await searchParams
  const requestedWallets = Number.parseInt(params.requiredWallets ?? "0", 10)
  const selectedPlan = getBillingPlan(params.plan)?.id ?? planForWalletCount(
    Number.isFinite(requestedWallets) ? requestedWallets : 0
  )
  const plan = billingPlans[selectedPlan]
  await requirePageUser(`/checkout?plan=${encodeURIComponent(selectedPlan)}`)

  const networks = [
    {
      id: "solana" as const,
      label: "Solana Pay",
      treasuryAddress: process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS,
    },
  ]

  return (
    <main className="premium-page security-grid min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image src="/logo.svg" alt="Tri-Proof Guard" width={26} height={26} priority className="rounded-md" />
            </span>
            <span className="text-sm font-semibold">Tri-Proof Guard</span>
          </Link>
          <Badge variant="secondary" className="gap-2 border-primary/30 text-primary">
            <BadgeCheck className="size-3.5" />
            Solana mainnet checkout
          </Badge>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-16">
        <Link href="/pricing" className={`${buttonVariants({ variant: "ghost", size: "sm" })} mb-8 -ml-3 text-muted-foreground hover:text-foreground`}>
          <ArrowLeft data-icon="inline-start" /> Back to pricing
        </Link>

        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-card/75 p-6 shadow-[0_0_44px_rgba(56,189,248,0.1)] sm:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-primary/80" />
            <Badge variant="secondary" className="mb-5 gap-2 border-primary/30 text-primary">
              <WalletCards className="size-3.5" />
              One-time analysis credit pack
            </Badge>
            <h1 className="text-3xl font-semibold sm:text-4xl">Power your next campaign review.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              {plan.name} activates a wallet analysis allowance for Tri-Proof Guard. Credits are used for wallet rows you analyze, never for simply logging in or opening a report.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/55 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Fixed plan value</p>
                <p className="mt-2 text-3xl font-semibold text-primary">{plan.amountUsdc} USDC</p>
                <p className="mt-1 text-xs text-muted-foreground">or a live SOL equivalent</p>
              </div>
              <div className="rounded-lg border border-border bg-background/55 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Analysis allowance</p>
                <p className="mt-2 text-3xl font-semibold">{plan.walletCredits.toLocaleString("en-US")}</p>
                <p className="mt-1 text-xs text-muted-foreground">wallet analysis credits</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 border-t border-border pt-6">
              {[
                [ShieldCheck, "No recurring billing", "This is a one-time credit purchase. There is no subscription renewal."],
                [FileCheck2, "Verified on-chain settlement", "Your payment is checked against the configured treasury before credits activate."],
                [Layers3, "Ready for campaign operations", "Use your credits for wallet scoring, clusters, funding context, and exportable decisions."],
              ].map(([Icon, title, detail]) => (
                <div key={title as string} className="flex gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10"><Icon className="size-4 text-primary" /></span>
                  <div><p className="text-sm font-medium">{title as string}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail as string}</p></div>
                </div>
              ))}
            </div>
          </section>

          <Card className="glass-panel premium-card animated-border overflow-hidden border-primary/35">
            <CardHeader className="border-b border-border bg-primary/5">
              <Badge variant="secondary" className="mb-3 w-fit border-primary/30 text-primary">Secure settlement</Badge>
              <CardTitle className="text-2xl">Complete your {plan.name} purchase</CardTitle>
              <CardDescription>
                Pay with Solana USDC or native SOL. The displayed USDC value is fixed; SOL uses a short-lived live quote before your wallet opens.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <CheckoutForm
                plan={{
                  id: plan.id,
                  name: plan.name,
                  amount: String(plan.amountUsdc),
                  wallets: plan.walletCredits.toLocaleString("en-US"),
                }}
                networks={networks}
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}
