import Image from "next/image"
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
  ShieldCheck,
  Send,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { scamGuardTelegramBotHandle, scamGuardTelegramBotUrl } from "@/lib/telegram/links"

export const metadata = {
  title: "Contact Tri-Proof Protocol | Support, Partnerships, and Product Questions",
  description:
    "Get in touch with Tri-Proof Protocol for support, product questions, partnership inquiries, and campaign wallet risk analysis solutions.",
}

const navLinks = [
  ["Home", "/"],
  ["Docs", "/docs"],
  ["Blog", "/blog"],
  ["Pricing", "/pricing"],
]

const contactCards = [
  {
    icon: Mail,
    title: "General contact",
    text: "Product questions, support requests, usage questions and general feedback.",
    email: "info@triproofprotocol.com",
    cta: "Email support",
    href: "mailto:info@triproofprotocol.com?subject=Tri-Proof%20Guard%20Question",
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
]

const helpAreas = [
  [LifeBuoy, "Product support", "Questions about analysis creation, wallet reports, exports and dashboard usage."],
  [Bug, "Bug reports", "Tell us what broke, where it happened and how we can reproduce the issue."],
  [Building2, "Business plans", "Discuss larger wallet lists, campaign operations and custom review workflows."],
  [BadgeHelp, "Feature requests", "Suggest improvements for wallet risk scoring, reporting, admin tools or integrations."],
]

export default function ContactPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="glow-orb left-[-7rem] top-[-5rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-9rem] top-20 size-[28rem]" style={{ background: "var(--guard-purple)", animationDelay: "2s" }} />
          <div className="glow-orb bottom-[-10rem] left-1/3 size-96" style={{ background: "var(--guard-cyan)", opacity: 0.18, animationDelay: "5s" }} />
        </div>

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image src="/logo.svg" alt="Tri-Proof Guard" width={30} height={30} priority className="rounded-lg" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-200">Contact</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            {navLinks.map(([label, href]) => (
              <Link key={label} href={href} className="transition-colors hover:text-primary">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/scamguard" className={`${buttonVariants()} glow-primary hover-lift`}>Open Demo</Link>
        </header>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="reveal-up flex flex-col gap-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="cyber-chip">Contact Tri-Proof Protocol</span>
              <Badge variant="secondary" className="border-primary/40 bg-primary/10 text-cyan-100">Support & partnerships</Badge>
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-balance text-white drop-shadow-[0_0_24px_rgba(56,189,248,0.18)] sm:text-6xl lg:text-7xl">
              Questions, feedback or partnership ideas? Let&apos;s talk.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Reach the Tri-Proof team for product questions, wallet analysis support, business partnerships, integrations and campaign risk review conversations.
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
                <p className="text-sm text-slate-300">Use the right inbox for faster routing</p>
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

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div className="reveal-up">
          <span className="cyber-chip">Message builder</span>
          <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Prepare your message.</h2>
          <p className="mt-5 leading-7 text-slate-300">
            Use the fields as a quick guide, then send your request by email. Include your project name, chain, campaign type and wallet list size when possible so the team can respond faster.
          </p>
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-sm leading-6 text-slate-300">
            For partnerships and ecosystem collaborations, contact <span className="font-mono text-cyan-300">sdemirbozan@triproofprotocol.com</span> directly.
          </div>
        </div>

        <Card className="glass-panel premium-card animated-border reveal-up delay-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><MessageSquare className="text-primary" /> What to include</CardTitle>
            <CardDescription className="text-slate-300">Copy these details into your email for a faster reply.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input readOnly value="Full name" />
              <Input readOnly value="Email address" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input readOnly value="Message type: support / partnership / feedback" />
              <Input readOnly value="Subject" />
            </div>
            <Textarea readOnly rows={7} value={"Project name:\nCampaign type:\nChain:\nWallet list size:\nWhat do you need help with?"} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
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
            <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">What to contact us about.</h2>
            <p className="mt-4 text-slate-300">Choose the message type that best matches your request so it can be routed correctly.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {helpAreas.map(([Icon, title, text], index) => (
              <Card key={title as string} className="glass-panel premium-card hover-lift reveal-up" style={{ animationDelay: `${index * 0.06}s` }}>
                <CardHeader>
                  <Icon className="text-primary" />
                  <CardTitle className="text-white">{title as string}</CardTitle>
                  <CardDescription className="text-slate-300">{text as string}</CardDescription>
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
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">Let&apos;s discuss how Tri-Proof Guard can help your team review wallet lists before rewards are sent.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="mailto:sdemirbozan@triproofprotocol.com?subject=Tri-Proof%20Partnership%20Inquiry" className={`${buttonVariants({ size: "lg" })} glow-primary hover-lift`}><Handshake data-icon="inline-start" /> Partnership inquiry</a>
            <a href="mailto:info@triproofprotocol.com?subject=Tri-Proof%20Support" className={`${buttonVariants({ variant: "outline", size: "lg" })} hover-lift text-white`}><Headphones data-icon="inline-start" /> Product support</a>
          </div>
        </div>
      </section>
    </main>
  )
}
