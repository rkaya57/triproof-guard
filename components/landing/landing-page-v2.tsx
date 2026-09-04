import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  FileCheck2,
  LockKeyhole,
  Network,
  Radar,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

const navLinks = [
  ["Solutions", "#solutions"],
  ["Use Cases", "#workflow"],
  ["Pricing", "/pricing"],
  ["Docs", "/docs"],
  ["Proof", "#proof"],
] as const

const securitySignals = [
  [ShieldCheck, "Privacy first", "No custody or secret collection."],
  [FileCheck2, "Explainable decisions", "Evidence and confidence stay visible."],
  [Users, "Human review", "Gray-zone cases remain reviewable."],
  [Code2, "Developer friendly", "Selected API and webhook pilots."],
] as const

const solutions = [
  {
    icon: ScanSearch,
    eyebrow: "Protect users before they sign",
    title: "ScamGuard",
    text: "Understand risky links, wallets, contracts and transaction intent before users click, trust or sign.",
    features: ["Web Scanner", "Chrome Extension", "Telegram Bot"],
    href: "/scamguard",
    cta: "Scan a risk",
    links: [["Chrome Extension", "/extension"], ["Telegram Bot", scamGuardTelegramBotUrl]],
  },
  {
    icon: Radar,
    eyebrow: "Protect campaign rewards",
    title: "Sybil Analyst",
    text: "Review low-quality participants, suspicious clusters and gray-zone wallets before rewards are distributed.",
    features: ["Wallet Risk Analysis", "Cluster Detection", "On-chain Evidence", "CSV & PDF Export"],
    href: "/audit",
    cta: "Analyze a wallet list",
    links: [["Sample report", "/demo/report"], ["Wallet pricing", "/pricing#campaign"]],
  },
  {
    icon: Network,
    eyebrow: "Protect communities & products",
    title: "Community & Platform Protection",
    text: "Bring explained threat decisions into Telegram operations and selected product integrations.",
    features: ["Group Guardian", "Project Registry", "Developer API", "Signed Webhooks"],
    href: "/telegram",
    cta: "Protect a Telegram community",
    links: [["Advanced capabilities", "/pricing#advanced"], ["Request a pilot", "/contact?topic=security-pilot"]],
    advanced: true,
  },
] as const

const workflow = [
  ["01", ScanSearch, "Submit the target", "Paste a risk target or upload a campaign wallet list."],
  ["02", Radar, "Enrich the evidence", "Combine domain, transaction, registry, RPC and campaign signals."],
  ["03", ShieldCheck, "Receive an explainable decision", "See risk, confidence, reasons and the recommended action."],
  ["04", Zap, "Act or export", "Warn a user, review a wallet, protect a group or export decision lists."],
] as const

const proofCards = [
  [ScanSearch, "ScamGuard result", "Inspect link and transaction risk with evidence in context.", "/scamguard", "Open scanner"],
  [Radar, "Sybil decision report", "Review aggregate risk, clusters and flagged wallets from a sample analysis.", "/demo/report", "Open sample report"],
  [Bot, "Telegram protection", "See Group Guardian and private scanning workflows for communities.", "/telegram", "Open Telegram protection"],
  [Code2, "Integration & API", "Review current API documentation while production access remains selected-pilot based.", "/docs/api", "Review API documentation"],
] as const

export function LandingPageV2() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-slate-100">
      <section className="relative border-b border-white/[0.055] bg-[radial-gradient(circle_at_18%_8%,rgba(73,200,245,.085),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(155,140,255,.08),transparent_32%)]">
        <header className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-300/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_14px_34px_rgba(0,0,0,.2)]">
              <Image src="/logo.svg" alt="Tri-Proof Protocol" width={30} height={30} priority className="rounded-lg" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-[-0.015em] text-white">Tri-Proof Protocol</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/62">Web3 Security Platform</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-slate-400 lg:flex">
            {navLinks.map(([label, href]) => (
              <Link key={label} href={href} className="transition-colors duration-150 hover:text-slate-100">
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className={`${buttonVariants({ variant: "outline" })} hidden sm:inline-flex`}>Login</Link>
            <Link href="/audit" className={`${buttonVariants()} glow-primary`}>Analyze a wallet</Link>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:items-center lg:pb-24 lg:pt-16">
          <div>
            <Badge variant="outline" className="mb-6 border-cyan-300/18 bg-cyan-300/[0.045] text-cyan-100">
              <Sparkles className="mr-1.5 size-3.5" /> AI-powered risk intelligence
            </Badge>
            <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-5xl lg:text-[4.35rem]">
              Stop fake participants and risky signatures before they{" "}
              <span className="text-gradient animate-gradient-text">cost your campaign.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-400 sm:text-lg">
              Tri-Proof helps Web3 teams analyze wallet lists, scan links and transactions, and protect Telegram communities before rewards or signatures move.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/audit" className={`${buttonVariants({ size: "lg" })} glow-primary`}>
                Analyze a wallet now <ArrowRight className="size-4" />
              </Link>
              <Link href="/contact?topic=security-pilot" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Book a demo
              </Link>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {securitySignals.map(([Icon, title, text]) => (
                <div key={title} className="hover-lift rounded-2xl border border-white/[0.06] bg-white/[0.022] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.02)] backdrop-blur-sm">
                  <Icon className="size-4 text-cyan-300/90" />
                  <p className="mt-3 text-sm font-medium text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel relative overflow-hidden rounded-3xl p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-violet-400/[0.055] blur-3xl" />
            <div className="relative flex items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
              <div>
                <p className="font-semibold text-white">Tri-Proof Guard Platform</p>
                <p className="mt-1 text-xs text-slate-500">One platform, three security outcomes.</p>
              </div>
              <Badge variant="outline" className="border-emerald-300/18 bg-emerald-300/[0.04] text-emerald-200">
                <span className="pulse-dot mr-1.5" /> Live surfaces
              </Badge>
            </div>

            <div className="relative mt-5 grid gap-4">
              {[
                [ScanSearch, "Safer users", "ScamGuard checks risk before clicks, trust and signatures."],
                [Radar, "Cleaner reward campaigns", "Sybil Analyst separates clear participants from coordinated or gray-zone wallets."],
                [Bot, "Protected communities", "Group Guardian brings explained threat decisions into Telegram operations."],
              ].map(([Icon, title, text]) => (
                <div key={title as string} className="hover-lift rounded-2xl border border-white/[0.055] bg-black/10 p-5 hover:border-cyan-300/15 hover:bg-cyan-300/[0.018]">
                  <div className="flex gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.045]">
                      <Icon className="size-5 text-cyan-300/90" />
                    </span>
                    <div>
                      <p className="font-semibold text-white">{title as string}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{text as string}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative mt-5 rounded-2xl border border-violet-300/14 bg-violet-300/[0.035] p-5">
              <p className="text-[10px] uppercase tracking-[0.17em] text-violet-200/82">Clear product boundary</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Developer API, signed webhooks and Team Policies remain advanced capabilities offered through selected pilot integrations until real-world usage is validated.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" className="border-b border-white/[0.055] bg-[linear-gradient(180deg,#050b16,#06101c)]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 lg:py-24">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/72">A complete security stack</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">One platform packaged around three customer outcomes.</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              Choose the protection surface that matches the decision your team needs to make. Core workflows stay clear; advanced integration capabilities stay explicitly bounded.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {solutions.map((solution) => {
              const Icon = solution.icon
              return (
                <article key={solution.title} className="glass-panel hover-lift flex min-h-[470px] flex-col rounded-3xl p-6">
                  <span className="flex size-12 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-300/[0.045]">
                    <Icon className="size-6 text-cyan-300/90" />
                  </span>
                  <p className="mt-6 text-[10px] uppercase tracking-[0.17em] text-cyan-200/70">{solution.eyebrow}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{solution.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{solution.text}</p>
                  <ul className="mt-6 grid gap-3 text-sm text-slate-300">
                    {solution.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-cyan-300/90" /> {feature}
                      </li>
                    ))}
                  </ul>
                  {"advanced" in solution && solution.advanced && (
                    <Badge variant="outline" className="mt-5 w-fit border-amber-300/16 bg-amber-300/[0.035] text-amber-200">
                      Advanced capabilities · selected pilots
                    </Badge>
                  )}
                  <div className="mt-auto border-t border-white/[0.055] pt-6">
                    <Link href={solution.href} className={`${buttonVariants()} w-full`}>
                      {solution.cta} <ArrowRight className="size-4" />
                    </Link>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                      {solution.links.map(([label, href]) =>
                        href.startsWith("http") ? (
                          <a key={label} href={href} target="_blank" rel="noreferrer" className="text-cyan-300/82 hover:text-cyan-200">{label}</a>
                        ) : (
                          <Link key={label} href={href} className="text-cyan-300/82 hover:text-cyan-200">{label}</Link>
                        )
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-b border-white/[0.055] bg-background">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 lg:py-24">
          <p className="text-xs uppercase tracking-[0.18em] text-violet-200/72">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">From target to defensible action.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflow.map(([number, Icon, title, text]) => (
              <div key={number} className="hover-lift rounded-2xl border border-white/[0.06] bg-white/[0.022] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/12 bg-cyan-300/[0.04]">
                    <Icon className="size-5 text-cyan-300/88" />
                  </span>
                  <span className="font-mono text-xs text-cyan-200/66">{number}</span>
                </div>
                <h3 className="mt-5 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="border-b border-white/[0.055] bg-[linear-gradient(180deg,#06101c,#030712)]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 lg:py-24">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/72">Deep inspection</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">Inspect working product surfaces.</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Open working surfaces and sample outputs before choosing the workflow that fits your team.
          </p>
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {proofCards.map(([Icon, title, text, href, action]) => (
              <article key={title as string} className="hover-lift flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.022] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]">
                <Icon className="size-5 text-cyan-300/90" />
                <h3 className="mt-4 font-semibold text-white">{title as string}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{text as string}</p>
                <Link href={href as string} className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-5`}>
                  {action as string} <ArrowRight className="size-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid gap-6 rounded-3xl border border-violet-300/12 bg-[linear-gradient(110deg,rgba(6,16,28,.98),rgba(22,31,62,.62),rgba(54,30,83,.32))] p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-white">Built for trust. Ready for real workflows.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [LockKeyhole, "Privacy first", "No custody or secret collection."],
                  [FileCheck2, "Transparent signals", "Clear reasons and confidence."],
                  [ShieldCheck, "Operationally bounded", "Claims stay inside validated capability."],
                  [WalletCards, "Campaign ready", "Wallet-list analysis and export workflows."],
                ].map(([Icon, title, text]) => (
                  <div key={title as string} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-cyan-300/88" />
                    <div>
                      <p className="text-sm font-medium text-white">{title as string}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{text as string}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>
              View pricing <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mx-auto mt-10 flex max-w-4xl flex-col items-center justify-between gap-5 rounded-2xl border border-cyan-300/12 bg-cyan-300/[0.025] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.02)] sm:flex-row sm:text-left">
            <div>
              <p className="font-semibold text-white">Ready to protect your users or your rewards?</p>
              <p className="mt-1 text-sm text-slate-500">Start with a real wallet-list analysis or discuss a selected security pilot.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/audit" className={`${buttonVariants()} glow-primary`}>
                Analyze a wallet <ArrowRight className="size-4" />
              </Link>
              <Link href="/contact?topic=security-pilot" className={buttonVariants({ variant: "outline" })}>Contact sales</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
