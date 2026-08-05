import Link from "next/link"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  History,
  KeyRound,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { analysisCreditPacks, subscriptionPlans } from "@/lib/billing/plans"

const needs = [
  {
    icon: WalletCards,
    question: "My own wallet",
    answer: "Start with Free. Choose Builder for history and deeper URL intelligence.",
    href: "#personal",
  },
  {
    icon: Bot,
    question: "A Telegram community",
    answer: "Choose Community for Group Guardian and community reporting.",
    href: "#community",
  },
  {
    icon: Radar,
    question: "An airdrop or campaign",
    answer: "Buy one-time Sybil wallet credits based on the participant list size.",
    href: "#campaign",
  },
  {
    icon: Code2,
    question: "A wallet, dApp, or platform",
    answer: "Request a selected pilot for API, signed webhooks, or Team Policies.",
    href: "#advanced",
  },
] as const

const personalPlans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    detail: "An everyday pre-sign safety layer.",
    href: "/scamguard",
    cta: "Sign in to scan",
    icon: ShieldCheck,
    features: ["Basic ScamGuard scans", "Telegram ScamGuard Bot", "Shareable reports", "Daily scan limit"],
  },
  {
    id: "builder",
    name: subscriptionPlans.builder.name,
    price: `$${subscriptionPlans.builder.amountUsdc}/month`,
    detail: "For researchers and active Web3 users.",
    href: "/checkout?plan=builder",
    cta: "Choose Builder",
    icon: History,
    featured: true,
    features: ["Higher daily scan limit", "Scan history", "Deep URL Sandbox", "Cross-domain Scam DNA analysis"],
  },
] as const

const sybilPacks = Object.values(analysisCreditPacks).map((pack, index) => ({
  ...pack,
  href: `/checkout?pack=${pack.id}`,
  featured: index === 1,
  perWallet: (pack.amountUsdc / pack.walletCredits).toFixed(index === 2 ? 3 : 4),
  detail: index === 0 ? "For a focused wallet-list review." : index === 1 ? "For recurring campaigns and community programs." : "For large participant datasets.",
}))

const accessJourney = [
  [WalletCards, "Choose the job", "Select ongoing ScamGuard or Community access, one-time campaign wallet credits, or a selected integration pilot."],
  [ShieldCheck, "Activate clearly", "Paid access uses a fixed USDC price or a live SOL equivalent with manual renewal and no silent wallet transfer."],
  [KeyRound, "Use the right workspace", "Scan risks, protect a Telegram group, analyze a campaign wallet list, or work with the team on a pilot integration."],
] as const

export function PricingPage() {
  return (
    <main className="premium-page min-h-screen bg-background">
      <PublicTopNav />

      <section className="security-grid border-y border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">Clear access by customer need</Badge>
          <h1 className="max-w-4xl text-4xl font-semibold sm:text-6xl">Choose the protection model that matches your Web3 surface.</h1>
          <p className="mt-5 max-w-3xl text-muted-foreground">Paid subscriptions are 30-day access passes with manual renewal. Sybil wallet credits are one-time purchases that remain available until used. Advanced product integrations are offered through selected pilots until real-world usage is validated.</p>
        </div>
      </section>

      <section className="border-b border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="mb-7 max-w-3xl">
            <Badge variant="secondary" className="w-fit border-primary/30 text-primary">Selection helper</Badge>
            <h2 className="mt-3 text-3xl font-semibold">What do you need to protect?</h2>
            <p className="mt-3 text-muted-foreground">Choose your situation first. You will move directly to the relevant plan or access model.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {needs.map((need) => {
              const Icon = need.icon
              return (
                <a key={need.question} href={need.href} className="rounded-2xl border border-border bg-background/55 p-5 transition-all hover:-translate-y-1 hover:border-primary/40 hover:bg-primary/5">
                  <Icon className="size-5 text-primary" />
                  <p className="mt-4 font-semibold">{need.question}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{need.answer}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">Show recommendation <ArrowRight className="size-4" /></span>
                </a>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {accessJourney.map(([Icon, title, text], index) => (
            <div key={title} className="rounded-2xl border border-border bg-background/45 p-5">
              <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10"><Icon className="size-4 text-primary" /></span><span className="font-mono text-xs text-primary/80">0{index + 1}</span></div>
              <p className="mt-4 font-semibold">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="personal" className="scroll-mt-8 border-y border-border bg-card/25">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 max-w-3xl">
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">For Web3 users and researchers</Badge>
            <h2 className="text-3xl font-semibold sm:text-4xl">ScamGuard personal access.</h2>
            <p className="mt-3 text-muted-foreground">The web scanner requires account sign-in before a scan starts. The Free plan provides a daily allowance; Builder adds deeper investigation and history.</p>
          </div>
          <div className="grid gap-5 lg:max-w-4xl lg:grid-cols-2">
            {personalPlans.map((plan) => {
              const Icon = plan.icon
              const featured = "featured" in plan && plan.featured
              return (
                <Card key={plan.id} className={featured ? "glass-panel premium-card relative overflow-hidden border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.14)]" : "glass-panel premium-card"}>
                  {featured && <Badge className="absolute right-4 top-4 gap-1 bg-primary text-primary-foreground"><Sparkles className="size-3.5" />For active users</Badge>}
                  <CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"><Icon className="size-5 text-primary" /></span><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.detail}</CardDescription><div className="pt-3 text-3xl font-semibold">{plan.price}</div>{plan.id !== "free" && <p className="pt-2 text-xs font-medium text-primary">30-day access. Manual renewal only.</p>}</CardHeader>
                  <CardContent className="flex flex-col gap-6"><ul className="flex flex-col gap-3">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul><Link href={plan.href} className={buttonVariants({ variant: featured ? "default" : "outline" })}>{plan.cta}<ArrowRight data-icon="inline-end" /></Link></CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="community" className="scroll-mt-8">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">For Telegram community teams</Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Community plan with Group Guardian.</h2>
              <p className="mt-4 leading-7 text-muted-foreground">Connect one active Telegram group, define an administrator-controlled alert policy, and retain decision history for operational review.</p>
              <div className="mt-6 flex flex-wrap gap-3"><Link href="/checkout?plan=community" className={buttonVariants()}>Choose Community <ArrowRight data-icon="inline-end" /></Link><Link href="/telegram" className={buttonVariants({ variant: "outline" })}>Open Telegram product page</Link></div>
            </div>
            <Card className="glass-panel premium-card border-primary/40 bg-primary/5">
              <CardHeader><Bot className="size-7 text-primary" /><CardTitle>{subscriptionPlans.community.name}</CardTitle><CardDescription>Protection for one active Telegram community.</CardDescription><div className="pt-3 text-3xl font-semibold">${subscriptionPlans.community.amountUsdc}/month</div><p className="pt-2 text-xs font-medium text-primary">30-day access. Manual renewal only.</p></CardHeader>
              <CardContent><ul className="grid gap-3 text-sm sm:grid-cols-2">{["One Telegram group", "Up to 3 group administrators", "Group Guardian decision history", "On-demand monthly community report", "Configurable alert threshold", "Private ScamGuard bot access"].map((feature) => <li key={feature} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</li>)}</ul></CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="campaign" className="scroll-mt-8 border-y border-border bg-card/25">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">Sybil campaign analysis</Badge>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h2 className="max-w-3xl text-3xl font-semibold sm:text-4xl">Pay only for the wallets you analyze.</h2><p className="mt-4 max-w-3xl text-muted-foreground">Each credit analyzes one campaign wallet. Credits are one-time purchases with no subscription, automatic renewal, or expiry.</p></div><div className="rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span className="font-semibold">1 credit</span> = 1 wallet analyzed</div></div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {sybilPacks.map((pack) => (
              <Card key={pack.id} className={pack.featured ? "glass-panel premium-card relative overflow-hidden border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.14)]" : "glass-panel premium-card"}>
                {pack.featured && <Badge className="absolute right-4 top-4 gap-1 bg-primary text-primary-foreground"><Sparkles className="size-3.5" />Best value</Badge>}
                <CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"><Database className="size-5 text-primary" /></span><CardTitle>{pack.name}</CardTitle><CardDescription>{pack.detail}</CardDescription><div className="pt-3 text-3xl font-semibold">{pack.amountUsdc} USDC</div><p className="pt-2 text-xs font-medium text-primary">{pack.walletCredits.toLocaleString()} wallet credits included</p></CardHeader>
                <CardContent className="flex flex-col gap-6"><div className="rounded-lg border border-border bg-background/50 p-4"><p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Effective price</p><p className="mt-1 text-lg font-semibold">{pack.perWallet} USDC <span className="text-sm font-normal text-muted-foreground">/ wallet</span></p></div><ul className="flex flex-col gap-3 text-sm"><li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Persistent credit balance</li><li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />No monthly renewal</li><li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />USDC or live SOL equivalent</li></ul><Link href={pack.href} className={buttonVariants({ variant: pack.featured ? "default" : "outline" })}>Choose {pack.name}<ArrowRight data-icon="inline-end" /></Link></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="advanced" className="scroll-mt-8">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <Badge variant="outline" className="mb-4 w-fit border-yellow-400/30 bg-yellow-400/5 text-yellow-100">Advanced capabilities · selected pilots</Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Developer API and Team Policies.</h2>
              <p className="mt-4 leading-7 text-muted-foreground">These capabilities are technically available, but broad production positioning is intentionally deferred until real pilot integrations establish response-time, throughput, and operating evidence.</p>
              <Link href="/contact?topic=security-pilot" className={`${buttonVariants()} mt-6`}>Request a selected pilot <ArrowRight data-icon="inline-end" /></Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [Code2, "Developer API", "Authenticated ScamGuard and analysis endpoints for selected wallet, dApp, launchpad, and campaign integrations."],
                [Sparkles, "Signed webhooks", "Decision delivery patterns that can be validated against a partner's real operational workflow."],
                [Users, "Team Policies", "Admin-defined allow, review, and block rules for supported risk conditions."],
                [ShieldCheck, "Pilot evidence plan", "Measure response time, availability, throughput, false positives, and operator outcomes before scaling claims."],
              ].map(([Icon, title, text]) => (
                <Card key={title as string} className="glass-panel premium-card"><CardHeader><Icon className="size-6 text-primary" /><CardTitle>{title as string}</CardTitle><CardDescription className="leading-6">{text as string}</CardDescription></CardHeader></Card>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
