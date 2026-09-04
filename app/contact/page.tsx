import Link from "next/link"
import {
  ArrowRight,
  BadgeHelp,
  Bug,
  Building2,
  Handshake,
  Headphones,
  LifeBuoy,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { scamGuardTelegramBotHandle, scamGuardTelegramBotUrl } from "@/lib/telegram/links"

export const metadata = {
  title: "Contact Tri-Proof Protocol | Support, Partnerships, and Product Questions",
  description:
    "Get in touch with Tri-Proof Protocol for support, product questions, partnership inquiries, and campaign wallet risk analysis solutions.",
}

const contactCards = [
  {
    icon: Mail,
    title: "General contact",
    text: "Product questions, support requests, usage questions and general feedback.",
    email: "info@triproofprotocol.com",
    cta: "Email support",
    href: "mailto:info@triproofprotocol.com?subject=Tri-Proof%20Protocol%20Question",
    external: false,
  },
  {
    icon: Handshake,
    title: "Partnerships & collaboration",
    text: "Strategic partnerships, integrations, campaign collaborations and ecosystem conversations.",
    email: "sdemirbozan@triproofprotocol.com",
    cta: "Discuss partnership",
    href: "mailto:sdemirbozan@triproofprotocol.com?subject=Tri-Proof%20Partnership%20Inquiry",
    external: false,
  },
  {
    icon: Send,
    title: "ScamGuard Telegram Bot",
    text: "Paste a suspicious Web3 link, wallet, mint, or transaction request for an explained ScamGuard review in chat.",
    email: scamGuardTelegramBotHandle,
    cta: "Open ScamGuard Bot",
    href: scamGuardTelegramBotUrl,
    external: true,
  },
] as const

const messageChecklist = [
  ["Project", "Project or organization name and your role."],
  ["Campaign", "Campaign type, target chain, and approximate wallet volume."],
  ["Goal", "What you need to protect, analyze, integrate, or troubleshoot."],
  ["Timing", "Launch date, review deadline, or other operational constraint."],
] as const

const helpAreas = [
  [LifeBuoy, "Product support", "Questions about analysis creation, wallet reports, exports and dashboard usage."],
  [Bug, "Bug reports", "Tell us what broke, where it happened and how we can reproduce the issue."],
  [Building2, "Business plans", "Discuss larger wallet lists, campaign operations and custom review workflows."],
  [BadgeHelp, "Feature requests", "Suggest improvements for wallet risk scoring, reporting, admin tools or integrations."],
] as const

export default function ContactPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-9rem] top-20 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
          <div className="glow-orb bottom-[-10rem] left-1/3 size-96" style={{ background: "var(--guard-cyan)", opacity: 0.18, animationDelay: "5s" }} />
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:py-24">
          <div className="reveal-up flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Contact Tri-Proof Protocol</span>
              <Badge variant="secondary" className="border-primary/40 bg-primary/10 text-cyan-100">Support & partnerships</Badge>
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-balance text-white drop-shadow-[0_0_24px_rgba(56,189,248,0.18)] sm:text-6xl lg:text-7xl">
              Questions, feedback or partnership ideas? Let&apos;s talk.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Reach the Tri-Proof team for product questions, Sybil analysis support, integrations, community protection and campaign risk review conversations.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href="mailto:info@triproofprotocol.com" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}>Email us <ArrowRight data-icon="inline-end" /></a>
              <Link href="/docs" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift text-white`}>Read docs</Link>
            </div>
          </div>

          <div className="glass-panel premium-card animated-border data-scan relative rounded-3xl p-6 reveal-up delay-200">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-white">Contact channels</p>
                <p className="text-sm text-slate-300">Use the right channel for faster routing</p>
              </div>
              <Sparkles className="text-primary" />
            </div>
            <div className="grid gap-4">
              {contactCards.map((card, index) => {
                const Icon = card.icon
                return (
                  <Card key={card.email} className="glass-panel premium-card hover-lift reveal-up border-primary/30 bg-slate-950/70" style={{ animationDelay: `${index * 0.08}s` }}>
                    <CardHeader>
                      <Icon className="text-cyan-300" />
                      <CardTitle className="text-white">{card.title}</CardTitle>
                      <CardDescription className="text-slate-300">{card.text}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4 break-all font-mono text-sm text-cyan-300">{card.email}</p>
                      <a href={card.href} target={card.external ? "_blank" : undefined} rel={card.external ? "noreferrer" : undefined} className={`${buttonVariants({ variant: "outline" })} text-white`}>{card.cta}</a>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-20">
        <div className="reveal-up">
          <span className="cyber-chip">Before you email</span>
          <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Send the context we need to help quickly.</h2>
          <p className="mt-5 leading-7 text-slate-300">
            There is no fake form or hidden submission step here. Email the team directly and include the operational context below so we can route the request correctly on the first reply.
          </p>
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-sm leading-6 text-slate-300">
            For partnerships and ecosystem collaborations, contact <span className="font-mono text-cyan-300">sdemirbozan@triproofprotocol.com</span> directly.
          </div>
        </div>

        <Card className="glass-panel premium-card animated-border reveal-up delay-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><MessageSquare className="text-primary" /> What to include</CardTitle>
            <CardDescription className="text-slate-300">A concise checklist for support, sales, pilot and integration requests.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {messageChecklist.map(([title, detail], index) => (
              <div key={title} className="rounded-2xl border border-border bg-background/50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 font-mono text-xs text-primary">0{index + 1}</span>
                  <p className="font-medium text-white">{title}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
              </div>
            ))}
            <div className="mt-2 flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
              <a href="mailto:info@triproofprotocol.com?subject=Tri-Proof%20Support" className={buttonVariants()}><Headphones data-icon="inline-start" /> Product support</a>
              <a href="mailto:sdemirbozan@triproofprotocol.com?subject=Tri-Proof%20Partnership%20Inquiry" className={`${buttonVariants({ variant: "outline" })} text-white`}><Handshake data-icon="inline-start" /> Partnership inquiry</a>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <span className="cyber-chip">How we can help</span>
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Choose the request that best matches your goal.</h2>
            <p className="mt-4 text-slate-300">Clear routing helps the team distinguish product support from partnership, campaign and product-integration work.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {helpAreas.map(([Icon, title, text], index) => (
              <Card key={title} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.06}s` }}>
                <CardHeader>
                  <Icon className="text-primary" />
                  <CardTitle className="text-white">{title}</CardTitle>
                  <CardDescription className="text-slate-300">{text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <div className="glass-panel premium-card animated-border rounded-3xl p-8 text-center reveal-up">
          <ShieldCheck className="mx-auto mb-4 text-primary" />
          <h2 className="text-gradient text-3xl font-semibold">Running a Web3 campaign?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">Discuss how Tri-Proof Sybil Analyst can help your team review wallet lists before rewards are distributed.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="mailto:sdemirbozan@triproofprotocol.com?subject=Tri-Proof%20Partnership%20Inquiry" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}><Handshake data-icon="inline-start" /> Partnership inquiry</a>
            <a href="mailto:info@triproofprotocol.com?subject=Tri-Proof%20Support" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift text-white`}><Headphones data-icon="inline-start" /> Product support</a>
          </div>
        </div>
      </section>
    </main>
  )
}
