import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Code2,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  MessageCircleWarning,
  Puzzle,
  ScanSearch,
  Send,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { scamGuardChromeWebStoreUrl } from "@/lib/scamguard/links"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

export const metadata = {
  title: "Product Academy | Tri-Proof Protocol",
  description: "Guided training for ScamGuard, Chrome extension, Telegram Group Guardian, Sybil Analyst and Tri-Proof APIs.",
}

const moduleNav = [
  ["Start here", "#start"],
  ["ScamGuard", "#scamguard"],
  ["Extension", "#extension"],
  ["Telegram", "#telegram-bot"],
  ["Group Guardian", "#group-guardian"],
  ["Sybil Analyst", "#sybil"],
  ["API", "#integrate"],
  ["Plans", "#plans"],
] as const

const quickStart = [
  [ScanSearch, "Check something before signing", "Use ScamGuard for a suspicious URL, wallet, token contract or transaction request.", "/scamguard", "Open ScamGuard"],
  [Puzzle, "Protect browser sessions", "Install the Chrome extension and review supported wallet requests before approving them.", scamGuardChromeWebStoreUrl, "Open Chrome Web Store"],
  [Bot, "Scan inside Telegram", "Send suspicious Web3 targets to the official ScamGuard Bot for an explained result.", scamGuardTelegramBotUrl, "Open Telegram Bot"],
  [WalletCards, "Review campaign participants", "Upload a wallet CSV, inspect evidence and clusters, simulate policy, then export decisions.", "/dashboard/new-analysis", "Start Sybil analysis"],
] as const

const scamGuardSteps = [
  ["Choose the target", "Select URL, Wallet, Token or Transaction based on what you are about to open, trust or sign."],
  ["Choose chain context", "Use Solana or EVM when the target is chain-specific. URL scans can begin without chain selection."],
  ["Read decision before score", "Start with risk level, confidence, primary reason and evidence. The score is a summary, not the explanation."],
  ["Act on the next step", "Stop on critical evidence. For caution, verify the official source and compare the wallet popup with the action you intended."],
] as const

const extensionSteps = [
  ["Install from Chrome Web Store", "Use the official ScamGuard Web3 Shield listing rather than downloading an unpacked archive."],
  ["Pin the extension", "Keep ScamGuard visible beside the address bar so the current page can be checked quickly."],
  ["Review supported wallet requests", "When a supported request appears, compare decoded intent, source context and the final wallet popup."],
  ["Keep the wallet as source of truth", "ScamGuard adds evidence and warnings; it never replaces the wallet confirmation screen or asks for secret wallet material."],
] as const

const telegramSteps = [
  ["Open the official bot", "Start a private chat with the official ScamGuard Bot and use /start to see available commands."],
  ["Submit a target", "Use /scan or paste a supported URL directly. Wallets, tokens and transaction requests can also be reviewed."],
  ["Read the explained report", "The bot separates decision, evidence and recommended action instead of returning only a risk score."],
  ["Use history when comparing threats", "Review recent scans when the same campaign, sender or target appears again."],
] as const

const guardianSteps = [
  ["Choose Community or eligible API access", "Group Guardian is a managed community-protection workflow rather than a generic public bot setting."],
  ["Connect the Telegram group", "Authorize the group from the Developer workspace, then complete the connection from an eligible group administrator."],
  ["Choose an alert threshold", "Start with high-risk for most public communities; tighten the policy only after moderators understand the alert volume."],
  ["Review repeated activity", "Guardian adds sender and repeated-target context so moderators can distinguish one-off links from recurring campaigns."],
  ["Enable moderation deliberately", "Time-limited mute actions require the correct Telegram permissions and remain admin-controlled."],
] as const

const sybilSteps = [
  ["Prepare the participant CSV", "Use one wallet per row. Referral, funder and event timestamps are optional but can strengthen relationship evidence."],
  ["Configure the analysis", "Choose chain, on-chain or hybrid evidence mode, and Conservative, Balanced or Strict risk policy."],
  ["Review evidence and clusters", "Inspect clear participants, gray-zone cases, funding relationships, timing, known entities and cluster reasoning."],
  ["Simulate policy before enforcement", "Use Policy Simulator to preview Allow, Review and Exclude outcomes before changing campaign eligibility decisions."],
  ["Export after human review", "Resolve gray-zone cases, then use the Decision Package or exports for the campaign workflow. Tri-Proof remains decision support."],
] as const

const apiSteps = [
  ["Choose the right contract", "Use API v1 for ScamGuard and general analysis integration. Use Campaign API v2 for campaign-native policy, decisions, clusters and run history."],
  ["Create a private API key", "Generate keys in Dashboard → Developer and store them only in server-side environment variables."],
  ["Use purpose-built endpoints", "Call ScamGuard before signing and campaign analysis before eligibility or reward distribution."],
  ["Preserve explanation", "Show decision, confidence, strongest evidence and next action rather than reducing the response to a single score."],
  ["Add signed webhooks when needed", "Use webhook events for backend automation while keeping wallet decisions and policy boundaries explicit."],
] as const

function StepList({ steps }: { steps: readonly (readonly [string, string])[] }) {
  return (
    <ol className="grid gap-3">
      {steps.map(([title, text], index) => (
        <li key={title} className="flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.018] p-4 sm:p-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.04] font-mono text-[10px] font-semibold text-cyan-200">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function AcademySection({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
  steps,
  actions,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  icon: typeof ShieldCheck
  steps: readonly (readonly [string, string])[]
  actions: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border first:border-t-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:py-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Badge variant="outline" className="border-cyan-300/18 bg-cyan-300/[0.035] text-cyan-100">{eyebrow}</Badge>
          <span className="mt-5 flex size-11 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-300/[0.04]"><Icon className="size-5 text-cyan-300" /></span>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
        </div>
        <StepList steps={steps} />
      </div>
    </section>
  )
}

export default function LearnPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:py-20">
          <div>
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary"><GraduationCap /> Product Academy</Badge>
            <h1 className="text-gradient mt-6 max-w-5xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Learn the workflow, then use the right Tri-Proof surface with confidence.</h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">Academy is the guided product layer. It explains what to do in ScamGuard, the extension, Telegram, Group Guardian, Sybil Analyst and the API without mixing those walkthroughs into technical reference docs.</p>
            <div className="mt-8 flex flex-wrap gap-3"><a href="#start" className={`${buttonVariants()} glow-primary`}>Start learning <ArrowRight data-icon="inline-end" /></a><Link href="/docs" className={buttonVariants({ variant: "outline" })}>Technical docs</Link></div>
          </div>

          <Card className="glass-panel premium-card rounded-3xl">
            <CardHeader><CardTitle>Your quickest path</CardTitle><CardDescription>Choose the outcome you need right now.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              {quickStart.map(([Icon, title, text, href, action]) => {
                const external = String(href).startsWith("http")
                return (
                  <a key={title as string} href={href as string} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="group flex gap-3 rounded-2xl border border-white/[0.06] bg-black/10 p-4 transition hover:border-cyan-300/18 hover:bg-cyan-300/[0.02]">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.04]"><Icon className="size-4 text-cyan-300" /></span>
                    <div><p className="text-sm font-semibold text-white">{title as string}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text as string}</p><p className="mt-2 text-xs font-medium text-cyan-300">{action as string} <ArrowRight className="inline size-3.5" /></p></div>
                  </a>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      <nav aria-label="Academy modules" className="border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 py-3 sm:px-8">
          {moduleNav.map(([label, href]) => <a key={href} href={href} className="shrink-0 rounded-xl border border-white/[0.06] px-3 py-2 text-xs text-muted-foreground transition hover:border-cyan-300/18 hover:text-cyan-200">{label}</a>)}
        </div>
      </nav>

      <section id="start" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div><Badge variant="secondary" className="border-primary/30 text-primary">Module 01</Badge><h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Choose by the decision you need to make.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">ScamGuard protects a user before interaction. Group Guardian protects a community conversation. Sybil Analyst protects a campaign allocation. APIs embed the same decision infrastructure into another product.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [ScanSearch, "Before a click or signature", "ScamGuard scanner or extension"],
              [MessageCircleWarning, "Inside Telegram", "Bot or Group Guardian"],
              [UsersRound, "Before campaign rewards", "Sybil Analyst"],
              [Code2, "Inside your own product", "API and signed webhooks"],
            ].map(([Icon, title, text]) => <Card key={title as string} className="glass-panel premium-card"><CardHeader><Icon className="size-5 text-primary" /><CardTitle className="text-base">{title as string}</CardTitle><CardDescription>{text as string}</CardDescription></CardHeader></Card>)}
          </div>
        </div>
      </section>

      <AcademySection id="scamguard" eyebrow="Module 02 · Pre-sign safety" title="Use ScamGuard before you interact." description="The scanner is for a concrete target you are about to open, trust, approve or sign." icon={ScanSearch} steps={scamGuardSteps} actions={<><Link href="/scamguard" className={buttonVariants()}>Open ScamGuard</Link><Link href="/threat-reports" className={buttonVariants({ variant: "outline" })}>Threat Pool</Link></>} />

      <AcademySection id="extension" eyebrow="Module 03 · Browser protection" title="Put ScamGuard next to the wallet prompt." description="The Chrome extension brings supported page and signing context into the browsing flow without asking for seed phrases or private keys." icon={Puzzle} steps={extensionSteps} actions={<><a href={scamGuardChromeWebStoreUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>Chrome Web Store <ArrowRight data-icon="inline-end" /></a><Link href="/extension" className={buttonVariants({ variant: "outline" })}>Extension details</Link></>} />

      <AcademySection id="telegram-bot" eyebrow="Module 04 · Chat-native scanning" title="Use ScamGuard in a private Telegram chat." description="The bot is useful when a suspicious target is already circulating in a chat and you want a readable decision without leaving Telegram." icon={Bot} steps={telegramSteps} actions={<><a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>Open Telegram Bot</a><Link href="/telegram" className={buttonVariants({ variant: "outline" })}>Telegram security center</Link></>} />

      <AcademySection id="group-guardian" eyebrow="Module 05 · Community defense" title="Protect a Telegram group with controlled automation." description="Group Guardian adds monitoring and repeated-threat context while keeping thresholds and moderator actions under authorized administrator control." icon={Send} steps={guardianSteps} actions={<><Link href="/checkout?plan=community" className={buttonVariants()}>Protect a community</Link><Link href="/dashboard/developer" className={buttonVariants({ variant: "outline" })}>Developer workspace</Link></>} />

      <AcademySection id="sybil" eyebrow="Module 06 · Campaign integrity" title="Turn a participant CSV into reviewable decisions." description="Sybil Analyst enriches wallet evidence, groups suspicious relationships, separates uncertainty, and lets operators test policy before enforcement." icon={WalletCards} steps={sybilSteps} actions={<><Link href="/dashboard/new-analysis" className={buttonVariants()}>Start analysis</Link><Link href="/demo/report" className={buttonVariants({ variant: "outline" })}>Sample report</Link><Link href="/pricing#campaign" className={buttonVariants({ variant: "ghost" })}>Wallet pricing</Link></>} />

      <AcademySection id="integrate" eyebrow="Module 07 · Developer integration" title="Embed explained security decisions into your product." description="Use the documented API contract that matches the workflow, keep keys server-side, and preserve evidence semantics in your own UI." icon={Code2} steps={apiSteps} actions={<><Link href="/docs/api" className={buttonVariants()}>API v1</Link><Link href="/docs/api/v2" className={buttonVariants({ variant: "outline" })}>Campaign API v2</Link><Link href="/docs/webhooks" className={buttonVariants({ variant: "outline" })}>Webhooks</Link></>} />

      <section id="plans" className="border-t border-border bg-primary/[0.025]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <div className="mb-8 max-w-3xl"><Badge variant="outline" className="border-primary/25 text-primary"><CreditCard /> Access model</Badge><h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Use the billing model that matches the product.</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">ScamGuard plans are time-based access. Sybil analysis uses persistent wallet credits. Community and API plans unlock their respective operational surfaces.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              [ShieldCheck, "Free / Builder", "Personal ScamGuard scanning and deeper individual protection."],
              [UsersRound, "Community", "One protected Telegram group with Group Guardian controls."],
              [FileSpreadsheet, "Sybil wallet credits", "Persistent one-time wallet analysis credits; one credit per wallet analyzed."],
              [Code2, "API Starter / Growth", "Backend request allowances, with Growth adding signed webhooks and higher-volume workflows."],
            ].map(([Icon, title, text]) => <Card key={title as string} className="glass-panel premium-card"><CardHeader><Icon className="size-5 text-primary" /><CardTitle className="text-base">{title as string}</CardTitle><CardDescription className="leading-6">{text as string}</CardDescription></CardHeader></Card>)}
          </div>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/pricing" className={buttonVariants()}>View pricing</Link><Link href="/contact" className={buttonVariants({ variant: "outline" })}>Talk to Tri-Proof</Link></div>
        </div>
      </section>
    </main>
  )
}
