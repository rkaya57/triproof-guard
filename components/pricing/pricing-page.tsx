import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Bot, CheckCircle2, Code2, Database, History, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { analysisCreditPacks, subscriptionPlans } from "@/lib/billing/plans"

const plans = [
  { id: "free", name: "Free", price: "$0", detail: "A useful everyday safety layer.", href: "/scamguard", cta: "Open ScamGuard", icon: ShieldCheck, features: ["Chrome extension", "Telegram ScamGuard Bot", "Basic scans and shareable reports", "Daily scan limit"] },
  { id: "builder", name: "Builder", price: `$${subscriptionPlans.builder.amountUsdc}/month`, detail: "For researchers and active Web3 users.", href: "/checkout?plan=builder", cta: "Choose Builder", icon: History, features: ["Scan history and higher daily limit", "Deep URL Sandbox", "Cross-domain Scam DNA analysis", "In-product safety alerts"] },
  { id: "community", name: "Community", price: `$${subscriptionPlans.community.amountUsdc}/month`, detail: "For Telegram communities that need a guardrail.", href: "/checkout?plan=community", cta: "Choose Community", icon: Bot, features: ["One Telegram group", "Up to 3 group administrators", "Group Guardian and decision history", "On-demand monthly community report"] },
  { id: "api_starter", name: "API Starter", price: `$${subscriptionPlans.api_starter.amountUsdc}/month`, detail: "For lean dApps and first integrations.", href: "/checkout?plan=api_starter", cta: "Choose API Starter", icon: Code2, features: ["Personal API key", "5,000 API requests / month", "ScamGuard and analysis endpoints", "Usage visibility"] },
  { id: "api_growth", name: "API Growth", price: `$${subscriptionPlans.api_growth.amountUsdc}/month`, detail: "For production wallet and dApp flows.", href: "/checkout?plan=api_growth", cta: "Choose API Growth", icon: Sparkles, featured: true, features: ["25,000 API requests / month", "Signed analysis webhooks", "Priority integration support", "One Telegram group"] },
] as const

const sybilPacks = Object.values(analysisCreditPacks).map((pack, index) => ({
  ...pack,
  href: `/checkout?pack=${pack.id}`,
  featured: index === 1,
  perWallet: (pack.amountUsdc / pack.walletCredits).toFixed(index === 2 ? 3 : 4),
  detail: index === 0 ? "For a focused wallet cluster check." : index === 1 ? "For recurring campaign and community research." : "For large-scale investigation workflows.",
}))

export function PricingPage() {
  return (
    <main className="premium-page min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Link href="/" className="flex items-center gap-3"><Image src="/logo.svg" alt="Tri-Proof Guard" width={36} height={36} priority className="rounded-lg" /><span className="text-sm font-semibold">Tri-Proof Guard</span></Link><div className="flex items-center gap-3"><Link href="/docs" className={buttonVariants({ variant: "outline" })}>Docs</Link><Link href="/scamguard" className={`${buttonVariants()} glow-primary`}>Open Scanner</Link></div></header>
      <section className="security-grid border-y border-border"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">USDC or SOL monthly access</Badge><h1 className="max-w-4xl text-4xl font-semibold sm:text-6xl">Choose the protection layer that matches your Web3 surface.</h1><p className="mt-5 max-w-3xl text-muted-foreground">Every paid plan is a 30-day access pass. Pay a fixed USDC amount or a live SOL equivalent, then renew manually when you want to continue. No card charges or silent recurring wallet transfers.</p></div></section>
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">{plans.map((plan) => { const Icon = plan.icon; const featured = "featured" in plan && plan.featured; return <Card key={plan.id} className={featured ? "glass-panel premium-card relative overflow-hidden border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.14)]" : "glass-panel premium-card"}>{featured && <Badge className="absolute right-4 top-4 gap-1 bg-primary text-primary-foreground"><Sparkles className="size-3.5" />Best for integrations</Badge>}<CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"><Icon className="size-5 text-primary" /></span><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.detail}</CardDescription><div className="pt-3 text-3xl font-semibold">{plan.price}</div>{plan.id !== "free" && <p className="pt-2 text-xs font-medium text-primary">30-day access. Manual renewal only.</p>}</CardHeader><CardContent className="flex flex-col gap-6"><ul className="flex flex-col gap-3">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul><Link href={plan.href} className={buttonVariants({ variant: featured ? "default" : "outline" })}>{plan.cta}<ArrowRight data-icon="inline-end" /></Link></CardContent></Card> })}</div></section>
      <section className="border-y border-border bg-card/25">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">Sybil campaign analysis</Badge>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h2 className="max-w-3xl text-3xl font-semibold sm:text-4xl">Pay only for the wallets you analyze.</h2><p className="mt-4 max-w-3xl text-muted-foreground">Each credit analyzes one wallet in a Sybil campaign. These are one-time USDC or SOL purchases, not subscriptions: no renewal, no expiry, and an exact per-wallet cost before checkout.</p></div><div className="rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span className="font-semibold">1 credit</span> = 1 wallet analyzed</div></div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">{sybilPacks.map((pack) => <Card key={pack.id} className={pack.featured ? "glass-panel premium-card relative overflow-hidden border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.14)]" : "glass-panel premium-card"}>{pack.featured && <Badge className="absolute right-4 top-4 gap-1 bg-primary text-primary-foreground"><Sparkles className="size-3.5" />Best value</Badge>}<CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"><Database className="size-5 text-primary" /></span><CardTitle>{pack.name}</CardTitle><CardDescription>{pack.detail}</CardDescription><div className="pt-3 text-3xl font-semibold">{pack.amountUsdc} USDC</div><p className="pt-2 text-xs font-medium text-primary">{pack.walletCredits.toLocaleString()} wallet credits included</p></CardHeader><CardContent className="flex flex-col gap-6"><div className="rounded-lg border border-border bg-background/50 p-4"><p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Effective price</p><p className="mt-1 text-lg font-semibold">{pack.perWallet} USDC <span className="text-sm font-normal text-muted-foreground">/ wallet</span></p></div><ul className="flex flex-col gap-3 text-sm"><li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Persistent credit balance</li><li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />No monthly renewal</li><li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />USDC or live SOL equivalent</li></ul><Link href={pack.href} className={buttonVariants({ variant: pack.featured ? "default" : "outline" })}>Choose {pack.name}<ArrowRight data-icon="inline-end" /></Link></CardContent></Card>)}</div>
        </div>
      </section>
    </main>
  )
}
