import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Bot, CheckCircle2, Code2, History, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { subscriptionPlans } from "@/lib/billing/plans"

const plans = [
  { id: "free", name: "Free", price: "$0", detail: "A useful everyday safety layer.", href: "/scamguard", cta: "Open ScamGuard", icon: ShieldCheck, features: ["Chrome extension", "Telegram ScamGuard Bot", "Basic scans and shareable reports", "Daily scan limit"] },
  { id: "builder", name: "Builder", price: `$${subscriptionPlans.builder.amountUsdc}/month`, detail: "For researchers and active Web3 users.", href: "/checkout?plan=builder", cta: "Choose Builder", icon: History, features: ["Scan history and higher daily limit", "Deep URL Sandbox", "Cross-domain Scam DNA analysis", "In-product safety alerts"] },
  { id: "community", name: "Community", price: `$${subscriptionPlans.community.amountUsdc}/month`, detail: "For Telegram communities that need a guardrail.", href: "/checkout?plan=community", cta: "Choose Community", icon: Bot, features: ["One Telegram group", "Up to 3 group administrators", "Group Guardian and decision history", "On-demand monthly community report"] },
  { id: "api_starter", name: "API Starter", price: `$${subscriptionPlans.api_starter.amountUsdc}/month`, detail: "For lean dApps and first integrations.", href: "/checkout?plan=api_starter", cta: "Choose API Starter", icon: Code2, features: ["Personal API key", "5,000 API requests / month", "ScamGuard and analysis endpoints", "Usage visibility"] },
  { id: "api_growth", name: "API Growth", price: `$${subscriptionPlans.api_growth.amountUsdc}/month`, detail: "For production wallet and dApp flows.", href: "/checkout?plan=api_growth", cta: "Choose API Growth", icon: Sparkles, featured: true, features: ["25,000 API requests / month", "Signed analysis webhooks", "Priority integration support", "One Telegram group"] },
] as const

export function PricingPage() {
  return (
    <main className="premium-page min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Link href="/" className="flex items-center gap-3"><Image src="/logo.svg" alt="Tri-Proof Guard" width={36} height={36} priority className="rounded-lg" /><span className="text-sm font-semibold">Tri-Proof Guard</span></Link><div className="flex items-center gap-3"><Link href="/docs" className={buttonVariants({ variant: "outline" })}>Docs</Link><Link href="/scamguard" className={`${buttonVariants()} glow-primary`}>Open Scanner</Link></div></header>
      <section className="security-grid border-y border-border"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">USDC or SOL monthly access</Badge><h1 className="max-w-4xl text-4xl font-semibold sm:text-6xl">Choose the protection layer that matches your Web3 surface.</h1><p className="mt-5 max-w-3xl text-muted-foreground">Every paid plan is a 30-day access pass. Pay a fixed USDC amount or a live SOL equivalent, then renew manually when you want to continue. No card charges or silent recurring wallet transfers.</p></div></section>
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">{plans.map((plan) => { const Icon = plan.icon; const featured = "featured" in plan && plan.featured; return <Card key={plan.id} className={featured ? "glass-panel premium-card relative overflow-hidden border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.14)]" : "glass-panel premium-card"}>{featured && <Badge className="absolute right-4 top-4 gap-1 bg-primary text-primary-foreground"><Sparkles className="size-3.5" />Best for integrations</Badge>}<CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"><Icon className="size-5 text-primary" /></span><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.detail}</CardDescription><div className="pt-3 text-3xl font-semibold">{plan.price}</div>{plan.id !== "free" && <p className="pt-2 text-xs font-medium text-primary">30-day access. Manual renewal only.</p>}</CardHeader><CardContent className="flex flex-col gap-6"><ul className="flex flex-col gap-3">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul><Link href={plan.href} className={buttonVariants({ variant: featured ? "default" : "outline" })}>{plan.cta}<ArrowRight data-icon="inline-end" /></Link></CardContent></Card> })}</div></section>
    </main>
  )
}
