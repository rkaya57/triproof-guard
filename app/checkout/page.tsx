import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, BadgeCheck, BellRing, Bot, Code2, ShieldCheck, WalletCards } from "lucide-react"

import { CheckoutForm } from "@/components/checkout/checkout-form"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import {
  analysisCreditPackForWalletCount,
  getAnalysisCreditPack,
  getSubscriptionPlan,
  isSelfServeSubscriptionPlan,
  subscriptionPlans,
} from "@/lib/billing/plans"

const featureCopy = {
  free: ["Extension and Telegram bot", "Basic scans with daily limit", "Shareable security reports"],
  builder: ["Scan history and higher daily limits", "Deep URL Sandbox and Scam DNA", "In-product safety alerts"],
  community: ["One protected Telegram group", "Up to three group administrators", "Group Guardian and monthly community report"],
  api_starter: ["Personal API key", "5,000 API requests each month", "For lightweight dApp integrations"],
  api_growth: ["25,000 API requests each month", "Signed analysis webhooks", "Priority integration support"],
} as const

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string; pack?: string; requiredWallets?: string; currency?: string }> }) {
  const params = await searchParams
  const requestedPlan = getSubscriptionPlan(params.plan)
  if (requestedPlan && requestedPlan.id !== "free" && !isSelfServeSubscriptionPlan(requestedPlan.id)) {
    redirect("/contact?topic=security-pilot")
  }

  const requiredWallets = Number.parseInt(params.requiredWallets ?? "0", 10)
  const inferredPack = !params.pack && !params.plan && requiredWallets > 0
    ? analysisCreditPackForWalletCount(requiredWallets)
    : null
  const creditPack = getAnalysisCreditPack(params.pack) ?? inferredPack
  const selectedPlan = requestedPlan?.id ?? "builder"
  const plan = creditPack ? null : subscriptionPlans[selectedPlan]
  const initialCurrency = params.currency?.toUpperCase() === "SOL" ? "SOL" as const : "USDC" as const
  const checkoutItemQuery = creditPack ? `pack=${encodeURIComponent(creditPack.id)}` : `plan=${encodeURIComponent(selectedPlan)}`
  const checkoutQuery = `${checkoutItemQuery}&currency=${initialCurrency}`
  await requirePageUser(`/checkout?${checkoutQuery}`)

  if (plan?.id === "free") {
    return null
  }

  const networks = [{ id: "solana" as const, label: "Solana Pay", treasuryAddress: process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS }]
  const isCreditPack = Boolean(creditPack)
  const name = creditPack?.name ?? plan!.name
  const amountUsdc = creditPack?.amountUsdc ?? plan!.amountUsdc
  const perWallet = creditPack ? (creditPack.amountUsdc / creditPack.walletCredits).toFixed(4) : null
  const featureItems = creditPack
    ? [
        `${creditPack.walletCredits.toLocaleString()} wallet analyses included`,
        "One credit is used for each wallet analyzed",
        "Persistent credit balance with no renewal",
      ]
    : featureCopy[plan!.id]
  const icons = [ShieldCheck, isCreditPack ? WalletCards : plan!.telegramGroupLimit ? Bot : Code2, BellRing]

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 border-cyan-300/20 bg-cyan-300/[0.04] text-cyan-100">
              <BadgeCheck className="size-3.5" /> Secure checkout
            </Badge>
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">Complete your Tri-Proof purchase</h1>
            <p className="mt-2 text-sm text-muted-foreground">Verified Solana mainnet settlement with no recurring wallet approvals.</p>
          </div>
          <Badge variant="secondary" className="w-fit gap-2 border-primary/30 text-primary"><BadgeCheck className="size-3.5" /> Solana mainnet</Badge>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-16">
        <Link href="/pricing" className={`${buttonVariants({ variant: "ghost", size: "sm" })} mb-8 -ml-3 text-muted-foreground hover:text-foreground`}><ArrowLeft data-icon="inline-start" /> Back to pricing</Link>
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <section className="glass-panel premium-card relative overflow-hidden rounded-3xl border border-primary/20 p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-cyan-300/[0.05] blur-3xl" />
            <div className="relative">
              <Badge variant="secondary" className="mb-5 gap-2 border-primary/30 text-primary"><WalletCards className="size-3.5" /> {isCreditPack ? "Persistent Sybil wallet credits" : "30-day access pass"}</Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">{isCreditPack ? `Purchase ${name}.` : `Activate ${name}.`}</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">{isCreditPack ? "Credits are consumed one wallet at a time when a Sybil campaign analysis runs. They stay in your ledger until used, with no monthly renewal." : "A verified on-chain payment activates this plan for 30 days. Renewal is always manual: we never create wallet approvals or recurring transfers."}</p>
              <div className="mt-8 rounded-2xl border border-white/[0.07] bg-black/10 p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{isCreditPack ? "Credit-pack value" : "Plan value"}</p><p className="mt-2 text-4xl font-semibold text-primary">{amountUsdc} USDC<span className="ml-1 text-base text-muted-foreground">{isCreditPack ? ` / ${creditPack!.walletCredits.toLocaleString()} wallets` : " / 30 days"}</span></p><p className="mt-2 text-xs text-muted-foreground">{isCreditPack ? `${perWallet} USDC per wallet. Pay in USDC or a short-lived live SOL equivalent.` : "Pay in USDC or a short-lived live SOL equivalent."}</p></div>
              <div className="mt-8 grid gap-4 border-t border-border pt-6">
                {featureItems.map((detail, index) => { const Icon = icons[index]; return <div key={detail} className="flex gap-3"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10"><Icon className="size-4 text-primary" /></span><p className="pt-1 text-sm leading-5 text-muted-foreground">{detail}</p></div> })}
              </div>
            </div>
          </section>
          <Card className="glass-panel premium-card animated-border overflow-hidden border-primary/25"><CardHeader className="border-b border-border bg-primary/[0.035]"><Badge variant="secondary" className="mb-3 w-fit border-primary/30 text-primary">Secure settlement</Badge><CardTitle className="text-2xl">{isCreditPack ? `Complete your ${name} purchase` : `Complete your ${name} access pass`}</CardTitle><CardDescription>{isCreditPack ? "The wallet-credit amount is fixed. Every transfer is bound to a short-lived signed checkout reference; native SOL also locks a live quote." : "The USDC amount is fixed. Every transfer is bound to a short-lived signed checkout reference; native SOL also locks a live quote."}</CardDescription></CardHeader><CardContent className="pt-6"><CheckoutForm plan={{ id: creditPack?.id ?? plan!.id, name, amount: String(amountUsdc), wallets: isCreditPack ? `${creditPack!.walletCredits.toLocaleString()} wallets` : "30 days", purchaseKind: isCreditPack ? "credits" : "subscription" }} networks={networks} initialCurrency={initialCurrency} /></CardContent></Card>
        </div>
      </section>
    </main>
  )
}
