import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Code2,
  CreditCard,
  FileSpreadsheet,
  Globe2,
  MessageCircleWarning,
  Network,
  Puzzle,
  ScanSearch,
  Send,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

export const metadata = {
  title: "Product Academy | Tri-Proof Protocol",
  description:
    "Step-by-step training for ScamGuard, the Chrome extension, Telegram Group Guardian, Sybil Analyst, reports, billing, and the Tri-Proof Protocol API.",
}

const quickStart = [
  [ScanSearch, "Run your first ScamGuard scan", "Open the scanner, choose URL, wallet, token, or transaction, then review the evidence before you act.", "/scamguard", "Open ScamGuard"],
  [Puzzle, "Install the browser extension", "Load the extension in Chrome, pin it, then let it explain supported wallet connection and signing requests.", "#extension", "Extension guide"],
  [Bot, "Message the Telegram Bot", "Send /start, paste a Web3 URL, wallet, token, or transaction, and receive a readable pre-sign report.", "#telegram-bot", "Bot guide"],
  [WalletCards, "Start a Sybil analysis", "Buy wallet credits when needed, upload a campaign CSV, review the graph evidence, then export the decision list.", "#sybil", "Sybil guide"],
] as const

const productNavigation = [
  ["Start here", "#start"],
  ["ScamGuard", "#scamguard"],
  ["Extension", "#extension"],
  ["Telegram", "#telegram-bot"],
  ["Group Guardian", "#group-guardian"],
  ["Sybil Analyst", "#sybil"],
  ["Reports & API", "#integrate"],
  ["Plans", "#plans"],
]

const scamGuardSteps = [
  ["Choose a scan type", "Use URL for a page or campaign link, Wallet for an address, Token for a Solana mint or EVM contract, and Transaction for a signing payload."],
  ["Choose the chain when you know it", "Select Solana or EVM for addresses and transaction data. URL scans remain chain-neutral until the passive sandbox detects a single-chain integration."],
  ["Read the decision before the score", "Start with the risk decision, primary reason, confidence, and evidence. The score sorts urgency; the evidence explains it."],
  ["Follow the next action", "Stop on critical evidence. For caution, verify the official source and compare the exact wallet prompt with what you expected to do."],
] as const

const extensionSteps = [
  ["Download and unpack", "Download the ScamGuard extension package from the product page. Keep the folder in a stable location so Chrome can reload it during testing."],
  ["Open Chrome extensions", "Visit chrome://extensions, enable Developer mode, choose Load unpacked, then select the extracted extension folder that contains manifest.json."],
  ["Pin ScamGuard", "Use the browser extension menu to pin ScamGuard beside the address bar. Its popup can rescan the active page and open the full report."],
  ["Review wallet requests", "When a supported wallet request appears, ScamGuard explains the request type, decoded intent, source, evidence, and the safest next move. The wallet popup remains the source of truth."],
] as const

const telegramSteps = [
  ["Open the official bot", "Use the official ScamGuard Bot link below. Send /start to see the supported commands and /settings to confirm the analyst configuration."],
  ["Scan in a private chat", "Use /scan followed by a URL, address, mint, or supported transaction payload. You can also paste a normal URL directly."],
  ["Read the report", "The report separates summary, decision, evidence, transaction intent, and recommended action. Gemini can add an explanation, but deterministic evidence always controls the verdict."],
  ["Use history when comparing links", "Send /history to revisit recent scans in the chat. Open the full scanner when a result needs deeper investigation."],
] as const

const guardianSteps = [
  ["Add the bot to your group", "Make ScamGuard a group administrator with permission to restrict members if you want time-limited moderation actions."],
  ["Connect the group", "From the team dashboard, connect the Telegram group to a Community or API Growth plan. In the group, an authorized admin can use /guardian connect with the provided code."],
  ["Set the alert policy", "Use /guardian on, then choose /guardian threshold caution, high, or critical. Start at HIGH_RISK for most public groups."],
  ["Review repeated activity", "When the same sender repeatedly posts high-risk items or repeats a target, Group Guardian displays sender behavior and offers eligible administrators one-hour or twenty-four-hour mute actions."],
  ["Enable critical containment only when ready", "Use /guardian automute on after the bot has Restrict members permission. It can mute a non-admin sender for one hour only after a critical finding or a Team Policy block. Seed phrase, recovery phrase, mnemonic, and private-key requests are detected even without a link."],
] as const

const sybilSteps = [
  ["Prepare your campaign file", "Upload a CSV with a wallet address column. Optional referral, referrer, funder, and campaign fields add graph context when they are available."],
  ["Create an analysis", "Open New analysis, name the campaign, select the policy, and upload the CSV. One Sybil credit is used for each wallet analyzed."],
  ["Review decisions and graph evidence", "Separate approved, Gray Zone, and rejected wallets. Inspect shared funders, referral overlap, circular paths, timing, known entities, and cluster reasoning."],
  ["Export with a human checkpoint", "Use exports only after reviewing the Gray Zone. Tri-Proof is decision support: project operators keep final control over reward eligibility."],
] as const

const integrationSteps = [
  ["Create an API key", "Open the developer dashboard, create a scoped API key, and store it only in your server-side environment variables."],
  ["Use a purpose-built endpoint", "Use the ScamGuard scan endpoint for pre-sign checks and the analysis endpoint for campaign wallet lists. Do not expose API keys in a browser client."],
  ["Handle a clear response", "Show users the decision, confidence, strongest evidence, decoded intent, and next action. Never reduce a security response to only a score."],
  ["Add webhook automation", "API Growth can send signed analysis events to your backend so your campaign or dApp workflow can react without polling."],
] as const

function StepList({ steps }: { steps: readonly (readonly [string, string])[] }) {
  return (
    <ol className="grid gap-3">
      {steps.map(([title, text], index) => (
        <li key={title} className="flex gap-4 rounded-lg border border-border bg-background/55 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 font-mono text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ProductSection({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
  steps,
  actions,
  aside,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  icon: typeof ShieldCheck
  steps: readonly (readonly [string, string])[]
  actions: React.ReactNode
  aside: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border last:border-b-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:py-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <span className="cyber-chip">{eyebrow}</span>
          <span className="mt-5 flex size-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><Icon className="size-6" /></span>
          <h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">{title}</h2>
          <p className="mt-5 max-w-xl leading-7 text-muted-foreground">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
          <div className="mt-7 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">{aside}</div>
        </div>
        <StepList steps={steps} />
      </div>
    </section>
  )
}

export default function LearnPage() {
  return (
    <main className="premium-page min-h-screen overflow-hidden bg-background text-foreground">
      <section className="security-grid border-b border-border">
        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105"><Image src="/logo.svg" alt="Tri-Proof Protocol" width={30} height={30} priority className="rounded-md" /></span>
            <span><span className="block text-sm font-semibold">Tri-Proof Protocol</span><span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Product Academy</span></span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/docs" className="hover:text-primary">Docs</Link>
            <Link href="/pricing" className="hover:text-primary">Pricing</Link>
            <Link href="/contact" className="hover:text-primary">Contact</Link>
          </nav>
          <Link href="/scamguard" className={`${buttonVariants()} glow-primary`}>Open Scanner</Link>
        </header>

        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div>
            <div className="flex flex-wrap gap-3"><Badge variant="secondary" className="border-primary/30 text-primary">Hands-on product training</Badge><Badge variant="outline">Start in 15 minutes</Badge></div>
            <h1 className="text-gradient mt-6 max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">Learn every Tri-Proof product, from first scan to live protection.</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">This academy explains the workflows behind ScamGuard, the Chrome extension, Telegram protection, Sybil Analyst, shareable reports, and the developer API. Follow the sections in order or jump directly to the product you need.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#start" className={`${buttonVariants({ size: "lg" })} glow-primary`}>Start learning <ArrowRight data-icon="inline-end" /></a>
              <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg" })}>Reference docs</Link>
            </div>
          </div>
          <div className="glass-panel premium-card animated-border rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between"><div><p className="font-semibold">Your learning path</p><p className="text-sm text-muted-foreground">Personal protection, community defense, then operations.</p></div><Badge variant="secondary" className="text-primary">6 modules</Badge></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickStart.map(([Icon, title, text, href, action], index) => (
                <a key={title} href={href} className="group rounded-lg border border-border bg-background/55 p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-center justify-between"><Icon className="size-5 text-primary" /><span className="font-mono text-xs text-primary/70">0{index + 1}</span></div>
                  <p className="mt-4 font-semibold text-white">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p><p className="mt-4 text-sm font-medium text-primary">{action} <ArrowRight className="inline size-4" /></p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <nav className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur"><div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-5 py-3 sm:px-8">{productNavigation.map(([label, href]) => <a key={href} href={href} className="shrink-0 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">{label}</a>)}</div></nav>

      <section id="start" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div><span className="cyber-chip">Module 01</span><h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Choose the right product for the moment.</h2><p className="mt-5 max-w-xl leading-7 text-muted-foreground">Use ScamGuard when someone is about to click or sign. Use the extension at the wallet prompt. Use the Telegram Bot in chat. Use Group Guardian for a community. Use Sybil Analyst before a reward distribution. Use the API when your own product needs this intelligence programmatically.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[[ShieldAlert, "Before a click or signature", "ScamGuard scanner or extension"], [MessageCircleWarning, "Inside Telegram", "Bot or Group Guardian"], [UsersRound, "Before campaign rewards", "Sybil Analyst"], [Code2, "Inside a product", "API and webhooks"]].map(([Icon, title, text]) => { const ItemIcon = Icon as typeof ShieldAlert; return <Card key={title as string} className="glass-panel premium-card"><CardHeader><ItemIcon className="text-primary" /><CardTitle className="text-base">{title as string}</CardTitle><CardDescription>{text as string}</CardDescription></CardHeader></Card> })}
          </div>
        </div>
      </section>

      <ProductSection id="scamguard" eyebrow="Module 02 · personal safety" title="Use ScamGuard before you interact." description="ScamGuard is the product for checking a suspicious Web3 surface before a click, wallet connection, approval, or signature." icon={ScanSearch} steps={scamGuardSteps} actions={<><Link href="/scamguard" className={`${buttonVariants()} glow-primary`}>Open ScamGuard <ArrowRight data-icon="inline-end" /></Link><Link href="/scamguard/report" className={buttonVariants({ variant: "outline" })}>View sample report</Link></>} aside={<><strong className="text-white">Safety boundary:</strong> a SAFE result means no stop-level signal was found from available evidence. It is not a guarantee. Never share a seed phrase, private key, password, or recovery phrase.</>} />

      <ProductSection id="extension" eyebrow="Module 03 · browser protection" title="Install the Chrome extension." description="The extension brings ScamGuard into the browser and creates a human-readable checkpoint when a compatible wallet request is detected." icon={Puzzle} steps={extensionSteps} actions={<><a href="/downloads/scamguard-chrome-extension.zip" download className={buttonVariants()}>Download extension <ArrowRight data-icon="inline-end" /></a><Link href="/scamguard" className={buttonVariants({ variant: "outline" })}>Open scanner</Link></>} aside={<><strong className="text-white">Important:</strong> Chrome does not allow direct installation of an unsigned extension from a website. For local testing, Load unpacked is the correct path. Public distribution requires Chrome Web Store review.</>} />

      <ProductSection id="telegram-bot" eyebrow="Module 04 · chat-native scanning" title="Use ScamGuard in Telegram." description="The bot lets a user scan a suspicious item without leaving the chat where it appeared." icon={Bot} steps={telegramSteps} actions={<><a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={`${buttonVariants()} glow-primary`}><Send data-icon="inline-start" /> Open ScamGuard Bot</a><Link href="/scamguard" className={buttonVariants({ variant: "outline" })}>Open full scanner</Link></>} aside={<><strong className="text-white">What the analyst does:</strong> Gemini improves the explanation when available. It cannot overturn deterministic threat intelligence, sandbox evidence, or transaction decoding.</>} />

      <ProductSection id="group-guardian" eyebrow="Module 05 · community defense" title="Protect a Telegram community." description="Group Guardian is for teams that want automatic risk alerts, secret-material request detection, repeated-campaign intelligence, history, daily summaries, Team Policy enforcement, and controlled moderation inside a managed Telegram group." icon={UsersRound} steps={guardianSteps} actions={<><Link href="/dashboard/admin/telegram" className={`${buttonVariants()} glow-primary`}>Manage groups <ArrowRight data-icon="inline-end" /></Link><Link href="/pricing" className={buttonVariants({ variant: "outline" })}>View Community plan</Link></>} aside={<><strong className="text-white">Recommended setup:</strong> begin with a HIGH_RISK threshold. Add the bot as an admin only after connecting the correct group. Keep auto-containment off until the team intentionally grants Restrict members permission and agrees on its incident response rule.</>} />

      <ProductSection id="sybil" eyebrow="Module 06 · campaign integrity" title="Analyze campaign wallets with Sybil Analyst." description="Sybil Analyst helps campaign teams investigate wallet clusters before rewards, grants, allowlists, or loyalty points are distributed." icon={Network} steps={sybilSteps} actions={<><Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary`}>Create analysis <ArrowRight data-icon="inline-end" /></Link><Link href="/pricing?product=sybil" className={buttonVariants({ variant: "outline" })}>Get analysis credits</Link></>} aside={<><strong className="text-white">Best practice:</strong> do not make an automated reward decision from one isolated signal. Use the evidence graph and Gray Zone queue to handle legitimate edge cases fairly.</>} />

      <ProductSection id="integrate" eyebrow="Module 07 · reports and developer tools" title="Share results or integrate the engine." description="Shareable reports make a decision easy to review. The API lets dApps, wallets, launchpads, and campaign platforms request the same explainable intelligence from their own backend." icon={Code2} steps={integrationSteps} actions={<><Link href="/docs/api" className={`${buttonVariants()} glow-primary`}>Read API docs <ArrowRight data-icon="inline-end" /></Link><Link href="/dashboard/developer" className={buttonVariants({ variant: "outline" })}>Developer dashboard</Link></>} aside={<><strong className="text-white">Integration rule:</strong> send scan and wallet-list requests from your server. A browser extension or frontend should never expose a Tri-Proof API key.</>} />

      <section id="plans" className="border-y border-border bg-primary/[0.03]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20"><div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]"><div><span className="cyber-chip">Access and billing</span><h2 className="text-gradient mt-5 text-3xl font-semibold sm:text-5xl">Choose access based on the job.</h2><p className="mt-5 leading-7 text-muted-foreground">Free access covers everyday scanning. Builder adds individual intelligence. Community unlocks one protected Telegram group. API plans are for integrations. Sybil analysis uses clear per-wallet credit packs.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/pricing" className={`${buttonVariants()} glow-primary`}><CreditCard data-icon="inline-start" /> View plans</Link><Link href="/checkout" className={buttonVariants({ variant: "outline" })}>Open checkout</Link></div></div><div className="grid gap-3 sm:grid-cols-2">{[[ShieldCheck, "Free", "Extension, Telegram Bot, basic scans, shareable reports, daily limit."], [Globe2, "Builder", "Scan history, deeper URL sandboxing, Scam DNA, and alerts."], [UsersRound, "Community", "One Telegram group, Group Guardian, admins, history, and monthly report."], [FileSpreadsheet, "Sybil credits", "One persistent credit per wallet analyzed. No automatic renewal."]].map(([Icon, title, text]) => { const ItemIcon = Icon as typeof ShieldCheck; return <div key={title as string} className="rounded-lg border border-border bg-background/55 p-4"><ItemIcon className="size-5 text-primary" /><p className="mt-3 font-semibold text-white">{title as string}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p></div> })}</div></div></div></section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20"><div className="glass-panel premium-card animated-border rounded-lg p-8 text-center"><ShieldCheck className="mx-auto size-8 text-primary" /><h2 className="text-gradient mt-4 text-3xl font-semibold">Ready for your first protected workflow?</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-muted-foreground">Run a live ScamGuard check, start a campaign analysis, or bring protection directly into your Telegram community.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/scamguard" className={`${buttonVariants({ size: "lg" })} glow-primary`}>Run a scan <ArrowRight data-icon="inline-end" /></Link><Link href="/dashboard/new-analysis" className={buttonVariants({ variant: "outline", size: "lg" })}>Analyze wallets</Link><a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}><Send data-icon="inline-start" /> Telegram Bot</a></div></div></section>
    </main>
  )
}
