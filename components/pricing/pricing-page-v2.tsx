import Link from "next/link"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  Gauge,
  History,
  KeyRound,
  Layers3,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { analysisCreditPacks, subscriptionPlans } from "@/lib/billing/plans"

const needs = [
  {
    icon: WalletCards,
    title: "My own wallet",
    copy: "Scan links, transactions and signing intent before you approve them.",
    href: "#personal",
  },
  {
    icon: Bot,
    title: "A Telegram community",
    copy: "Protect members with Group Guardian, moderation controls and decision history.",
    href: "#community",
  },
  {
    icon: Radar,
    title: "An airdrop or campaign",
    copy: "Analyze participant wallets for Sybil risk with one-time wallet credits.",
    href: "#campaign",
  },
  {
    icon: Code2,
    title: "A wallet, dApp or platform",
    copy: "Use selected pilots for API access, signed webhooks and Team Policies.",
    href: "#advanced",
  },
] as const

const steps = [
  [WalletCards, "Choose the job", "Pick personal protection, community protection, campaign analysis or an integration pilot."],
  [ShieldCheck, "Activate clearly", "Subscriptions use fixed USDC pricing with manual renewal. Wallet credits are one-time purchases."],
  [KeyRound, "Use the right workspace", "Scan, moderate, analyze or integrate without mixing products and billing models."],
] as const

const personalPlans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    suffix: "Free forever",
    description: "For everyday pre-sign safety checks.",
    href: "/scamguard",
    cta: "Start free",
    icon: ShieldCheck,
    features: [
      "10 ScamGuard scans per day",
      "Telegram ScamGuard Bot",
      "Shareable reports",
      "Basic URL and transaction review",
    ],
  },
  {
    id: "builder",
    name: subscriptionPlans.builder.name,
    price: `$${subscriptionPlans.builder.amountUsdc}`,
    suffix: "/ month",
    description: "For researchers, analysts and active Web3 users.",
    href: "/checkout?plan=builder",
    cta: "Choose Builder",
    icon: History,
    featured: true,
    features: [
      "Up to 100 scans per day",
      "Deep URL Scam DNA analysis",
      "Scan history",
      "Priority investigation workflow",
    ],
  },
] as const

const creditPacks = Object.values(analysisCreditPacks).map((pack, index) => ({
  ...pack,
  href: `/checkout?pack=${pack.id}`,
  featured: index === 1,
  badge: index === 0 ? "Best for tests" : index === 1 ? "Most popular" : "Best value",
  description:
    index === 0
      ? "For focused campaign tests and small lists."
      : index === 1
        ? "For growing campaigns and recurring community programs."
        : "For large distributions and high-volume participant sets.",
}))

const trustItems = [
  [ShieldCheck, "No hidden fees", "Pricing is explicit before checkout."],
  [History, "Manual renewal", "No silent subscription renewal."],
  [Database, "Credits do not expire", "Wallet credits remain until used."],
  [Code2, "Pilot-first advanced access", "API and Team Policies stay selected-pilot only."],
] as const

export function PricingPageV2() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050914] text-white">
      <PublicTopNav />

      <section className="relative border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(91,33,182,.18),transparent_26%),radial-gradient(circle_at_18%_10%,rgba(6,182,212,.10),transparent_28%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200">
              Pricing · simple, transparent, powerful
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Choose the protection model that matches your <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">Web3 surface.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              From individual wallets to campaign operations and community security, Tri-Proof separates personal protection, subscriptions, wallet-analysis credits and selected integrations so you only pay for what you actually use.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-xs text-slate-300">
              {[
                [Gauge, "Explainable risk analysis"],
                [ShieldCheck, "Pre-sign protection"],
                [Layers3, "Campaign intelligence"],
              ].map(([Icon, label]) => (
                <span key={label as string} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
                  <Icon className="size-3.5 text-cyan-300" />
                  {label as string}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto flex min-h-[340px] w-full max-w-lg items-center justify-center">
            <div className="absolute size-72 rounded-full border border-cyan-400/10 bg-cyan-400/[0.03] shadow-[0_0_80px_rgba(34,211,238,.08)]" />
            <div className="absolute size-52 rotate-45 rounded-[2.5rem] border border-violet-400/15 bg-violet-500/[0.05]" />
            <div className="relative flex size-48 items-center justify-center rounded-[2.2rem] border border-cyan-300/25 bg-[linear-gradient(145deg,rgba(8,47,73,.92),rgba(30,64,175,.78),rgba(91,33,182,.7))] shadow-[0_0_90px_rgba(59,130,246,.25)]">
              <ShieldCheck className="size-24 text-cyan-100" strokeWidth={1.35} />
            </div>
            <span className="absolute left-5 top-14 rounded-2xl border border-cyan-400/15 bg-[#07101f]/90 p-3 shadow-xl"><WalletCards className="size-5 text-cyan-300" /></span>
            <span className="absolute right-4 top-20 rounded-2xl border border-violet-400/15 bg-[#07101f]/90 p-3 shadow-xl"><Radar className="size-5 text-violet-300" /></span>
            <span className="absolute bottom-10 left-14 rounded-2xl border border-blue-400/15 bg-[#07101f]/90 p-3 shadow-xl"><Bot className="size-5 text-blue-300" /></span>
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-white/[0.01]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Who do you need to protect?</h2>
            <p className="mt-3 text-sm text-slate-500">Start with the use case. We will take you directly to the relevant plan or access model.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {needs.map((need) => {
              const Icon = need.icon
              return (
                <a key={need.title} href={need.href} className="group rounded-2xl border border-white/[0.08] bg-[#07101f]/70 p-5 transition-all hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-cyan-400/[0.035] hover:shadow-[0_0_35px_rgba(34,211,238,.06)]">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04]"><Icon className="size-5 text-cyan-300" /></span>
                  <h3 className="mt-4 font-semibold text-white">{need.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{need.copy}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-cyan-300">View recommendation <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" /></span>
                </a>
              )
            })}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {steps.map(([Icon, title, text], index) => (
              <div key={title as string} className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
                <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-400/[0.04]"><Icon className="size-4 text-blue-300" /></span><span className="font-mono text-[10px] text-cyan-300/70">0{index + 1}</span></div>
                <h3 className="mt-4 font-semibold">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="personal" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div>
              <Badge variant="outline" className="border-cyan-400/20 bg-cyan-400/[0.04] text-cyan-200">For individuals & researchers</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">ScamGuard personal access.</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">Scan wallets, links and signing intent with Tri-Proof&apos;s pre-sign safety layer. Free keeps the core scanner accessible; Builder adds higher limits, deeper URL intelligence and scan history.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {personalPlans.map((plan) => {
                const Icon = plan.icon
                const featured = "featured" in plan && plan.featured
                return (
                  <div key={plan.id} className={featured ? "relative overflow-hidden rounded-2xl border border-cyan-300/35 bg-[linear-gradient(145deg,rgba(8,47,73,.50),rgba(15,23,42,.94)_52%,rgba(91,33,182,.22))] p-5 shadow-[0_0_45px_rgba(34,211,238,.10)]" : "rounded-2xl border border-white/[0.08] bg-[#07101f]/70 p-5"}>
                    {featured && <span className="absolute right-4 top-4 rounded-full border border-violet-300/20 bg-violet-500/20 px-2.5 py-1 text-[10px] font-medium text-violet-100">Most popular</span>}
                    <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04]"><Icon className="size-5 text-cyan-300" /></span>
                    <h3 className="mt-4 text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                    <div className="mt-5 flex items-end gap-2"><span className="text-4xl font-semibold tracking-tight">{plan.price}</span><span className="pb-1 text-xs text-slate-500">{plan.suffix}</span></div>
                    <ul className="mt-6 space-y-3">
                      {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-300" />{feature}</li>)}
                    </ul>
                    <Link href={plan.href} className={`${buttonVariants({ variant: featured ? "default" : "outline" })} mt-6 w-full ${featured ? "bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 text-white hover:opacity-90" : "border-white/10 bg-white/[0.02] text-slate-200"}`}>{plan.cta}<ArrowRight className="size-4" /></Link>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="community" className="scroll-mt-20 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <Badge variant="outline" className="border-violet-400/20 bg-violet-400/[0.04] text-violet-200">For Telegram communities & DAOs</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Community plan with Group Guardian.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">Protect one active Telegram community with administrator-controlled protection, configurable alerts and retained decision history.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/checkout?plan=community" className={`${buttonVariants()} bg-gradient-to-r from-blue-500 to-violet-500 text-white`}>Choose Community <ArrowRight className="size-4" /></Link>
              <Link href="/telegram" className={`${buttonVariants({ variant: "outline" })} border-white/10 bg-white/[0.02] text-slate-200`}>Open Telegram product page</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-300/25 bg-[linear-gradient(145deg,rgba(8,47,73,.40),rgba(15,23,42,.95)_55%,rgba(91,33,182,.16))] p-6 shadow-[0_0_50px_rgba(59,130,246,.08)]">
            <div className="flex items-start justify-between gap-4">
              <div><Bot className="size-7 text-violet-300" /><h3 className="mt-4 text-xl font-semibold">{subscriptionPlans.community.name}</h3><p className="mt-1 text-sm text-slate-500">Protection for one active Telegram community.</p></div>
              <div className="text-right"><span className="text-4xl font-semibold">${subscriptionPlans.community.amountUsdc}</span><span className="text-xs text-slate-500"> / month</span><p className="mt-1 text-[10px] text-cyan-300">Manual renewal</p></div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "One Telegram group",
                "Up to 3 group administrators",
                "Group Guardian decision history",
                "On-demand monthly community report",
                "Configurable alert threshold",
                "Private ScamGuard bot access",
              ].map((feature) => <div key={feature} className="flex items-start gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-300" />{feature}</div>)}
            </div>
          </div>
        </div>
      </section>

      <section id="campaign" className="scroll-mt-20 border-b border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="outline" className="border-cyan-400/20 bg-cyan-400/[0.04] text-cyan-200">For campaigns, airdrops & projects</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Pay only for the wallets you analyze.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">Each credit analyzes one campaign wallet. Credits are one-time purchases with no subscription, automatic renewal or expiry.</p>
            </div>
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] px-4 py-3 text-sm text-cyan-200"><strong>1 credit</strong> = 1 wallet analyzed</div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {creditPacks.map((pack) => (
              <div key={pack.id} className={pack.featured ? "relative rounded-2xl border border-cyan-300/30 bg-[linear-gradient(145deg,rgba(8,47,73,.40),rgba(15,23,42,.94)_55%,rgba(91,33,182,.18))] p-6 shadow-[0_0_40px_rgba(34,211,238,.07)]" : "relative rounded-2xl border border-white/[0.08] bg-[#07101f]/70 p-6"}>
                <span className={pack.featured ? "absolute right-4 top-4 rounded-full bg-cyan-400/15 px-2.5 py-1 text-[10px] text-cyan-100" : "absolute right-4 top-4 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-400"}>{pack.badge}</span>
                <Database className="size-6 text-cyan-300" />
                <h3 className="mt-4 text-lg font-semibold">{pack.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{pack.description}</p>
                <div className="mt-5 text-4xl font-semibold">{pack.amountUsdc} <span className="text-sm font-medium text-slate-400">USDC</span></div>
                <p className="mt-2 text-xs text-cyan-300">{pack.walletCredits.toLocaleString()} wallet credits</p>
                <Link href={pack.href} className={`${buttonVariants({ variant: pack.featured ? "default" : "outline" })} mt-6 w-full ${pack.featured ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white" : "border-white/10 bg-white/[0.02] text-slate-200"}`}>Choose {pack.name}<ArrowRight className="size-4" /></Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="advanced" className="scroll-mt-20 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
          <div>
            <Badge variant="outline" className="border-amber-400/20 bg-amber-400/[0.04] text-amber-200">Selected pilots only</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Developer API and Team Policies.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500">Advanced product integrations are technically available, but broad production positioning remains intentionally gated until partner pilots establish response-time, throughput and operating evidence.</p>
            <Link href="/contact?topic=security-pilot" className={`${buttonVariants()} mt-6 bg-gradient-to-r from-blue-500 to-violet-500 text-white`}>Request a selected pilot <ArrowRight className="size-4" /></Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [Code2, "Developer API", "Authenticated ScamGuard and analysis endpoints for selected integrations."],
              [Sparkles, "Signed webhooks", "Decision delivery patterns that can be validated inside a real partner workflow."],
              [Users, "Team Policies", "Administrator-defined allow, review and block rules for supported risk conditions."],
              [ShieldCheck, "Pilot evidence plan", "Measure response time, availability, throughput and operator outcomes before scaling claims."],
            ].map(([Icon, title, text]) => (
              <div key={title as string} className="rounded-2xl border border-white/[0.07] bg-[#07101f]/65 p-5"><Icon className="size-5 text-violet-300" /><h3 className="mt-4 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text as string}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            {trustItems.map(([Icon, title, text]) => (
              <div key={title as string} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4"><Icon className="mt-0.5 size-4 shrink-0 text-cyan-300" /><div><h3 className="text-sm font-medium">{title as string}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text as string}</p></div></div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-2xl border border-white/[0.07] bg-[#07101f]/65 p-6">
              <h3 className="text-lg font-semibold">Frequently asked questions</h3>
              <div className="mt-4 divide-y divide-white/[0.06] text-sm">
                {[
                  ["Do unused wallet credits expire?", "No. Purchased wallet credits remain available until they are used."],
                  ["Do subscriptions renew automatically?", "No. Paid access is manual-renewal only."],
                  ["Can API access be purchased directly?", "Not yet. API and Team Policies remain selected-pilot capabilities."],
                ].map(([q, a]) => <div key={q} className="py-4"><p className="font-medium text-slate-200">{q}</p><p className="mt-2 text-slate-500">{a}</p></div>)}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-violet-400/15 bg-[linear-gradient(135deg,rgba(30,41,59,.75),rgba(15,23,42,.94),rgba(91,33,182,.14))] p-6">
              <div className="absolute -right-10 -top-10 size-32 rounded-full bg-violet-500/10 blur-2xl" />
              <div className="relative"><Users className="size-7 text-violet-300" /><h3 className="mt-5 text-2xl font-semibold">Need a custom plan?</h3><p className="mt-3 max-w-lg text-sm leading-7 text-slate-500">If your project, exchange, wallet or protocol needs a tailored security workflow, talk to us about a pilot or enterprise deployment path.</p><Link href="/contact" className={`${buttonVariants()} mt-6 bg-gradient-to-r from-blue-500 to-violet-500 text-white`}>Contact sales <ArrowRight className="size-4" /></Link></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
