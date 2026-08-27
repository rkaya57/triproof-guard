import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Braces,
  Chrome,
  CircleAlert,
  FileCode2,
  Globe2,
  ScanSearch,
  ShieldCheck,
  WalletCards,
} from "lucide-react"

import {
  DocsCallout,
  DocsNextLinks,
  DocsPageIntro,
  ProductDocsShell,
} from "@/components/docs/product-docs-shell"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "ScamGuard Guide | Tri-Proof Documentation",
  description:
    "Learn how to use Tri-Proof ScamGuard to review suspicious URLs, wallet requests, tokens, contracts, and transaction intent before acting or signing.",
}

const toc = [
  { id: "what-it-does", label: "What ScamGuard does" },
  { id: "scan", label: "Choose the right scan" },
  { id: "read", label: "Read the result" },
  { id: "url", label: "URL review" },
  { id: "transaction", label: "Transaction intent" },
  { id: "channels", label: "Extension & Telegram" },
  { id: "limitations", label: "Safety limitations" },
]

const scanTypes = [
  [Globe2, "URL / domain", "Use for claim, mint, reward, presale, login, bridge, and unfamiliar Web3 pages before connecting a wallet."],
  [WalletCards, "Wallet / address", "Use when you need counterparty or address context before interacting."],
  [ScanSearch, "Token / contract", "Use for token mint or contract context, including relevant reputation and contract intelligence when available."],
  [Braces, "Transaction / wallet request", "Use before signing to understand approvals, transfers, authority changes, contract calls, or structured wallet requests."],
]

export default function ScamGuardDocsPage() {
  return (
    <ProductDocsShell currentPath="/docs/scamguard" toc={toc}>
      <DocsPageIntro
        eyebrow="Product guide"
        title="Use ScamGuard before you click, connect, approve, or sign"
        description="ScamGuard is the pre-action safety layer in Tri-Proof. It combines source context, passive URL inspection, transaction semantics, known-bad intelligence, and explicit limitations so a user can understand what appears risky before taking an irreversible wallet action."
      >
        <Link href="/scamguard" className={buttonVariants()}>
          Open ScamGuard
        </Link>
        <Link href="/extension" className={buttonVariants({ variant: "outline" })}>
          Browser extension
        </Link>
      </DocsPageIntro>

      <section id="what-it-does" className="scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">What ScamGuard is designed to answer</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          ScamGuard does not try to reduce every Web3 interaction to “safe” or “scam.” It asks a more useful set of questions: what surface is this, what does the request appear to do, what source and counterparty context is available, and is there enough evidence to recommend proceeding, reviewing, or blocking?
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Source", "Is the domain or surface verified, suspicious, unknown, redirected, or linked to known campaign intelligence?"],
            ["Intent", "What approval, transfer, authority, token, or contract action appears to be requested?"],
            ["Evidence", "Which concrete signals support the warning, and what data or provider limitations remain?"],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="scan" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">1. Choose the scan that matches the thing in front of you</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Paste the original value whenever possible. A URL should be scanned as a URL; a transaction or wallet request should be reviewed as signing intent rather than treated as plain text.
        </p>
        <div className="mt-5 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/75">
          {scanTypes.map(([Icon, title, text]) => (
            <div key={String(title)} className="flex gap-4 p-4 sm:p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                <Icon className="size-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{String(title)}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="read" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">2. Read the reason before the score</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Start with the primary reason and recommended action. Then inspect the supporting signals, decoded intent, source verification, counterparty context, and limitations. A numeric security or risk value is useful only when you understand what evidence produced it.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Proceed / low concern", "No major danger signal was found from the available evidence. This is not a guarantee that the action is safe."],
            ["Review / caution", "Something requires context: unknown source, incomplete inspection, meaningful permissions, or conflicting evidence."],
            ["Block / critical", "Strong danger signals such as known malicious infrastructure, dangerous secret requests, or high-impact signing intent justify stopping the action."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-border/75 bg-card/25 p-4">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <DocsCallout title="Verified project does not mean every request is harmless" tone="warning">
          Project/domain reputation and signing intent are separate evidence lanes. A legitimate project can still request a powerful approval, while an unknown domain can be benign. ScamGuard keeps those concepts separate so trusted branding cannot hide dangerous transaction semantics.
        </DocsCallout>
      </section>

      <section id="url" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <Globe2 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">3. Review suspicious URLs passively</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          URL review evaluates the normalized destination, reputation context, suspicious domain patterns, redirects, and bounded passive page evidence when available. Passive inspection is intended to collect evidence without executing arbitrary page JavaScript or connecting a wallet.
        </p>
        <div className="mt-5 rounded-xl border border-border/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Useful questions after a URL scan</p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
            <li>• Does the final destination match the official project domain you expected?</li>
            <li>• Did the page redirect through unrelated or disposable infrastructure?</li>
            <li>• Is the project/domain verified, merely unknown, or supported by known-bad evidence?</li>
            <li>• Was passive inspection complete, blocked, or limited?</li>
            <li>• Does the page ask for secrets, unusual permissions, or urgent claim/mint behavior inconsistent with the official flow?</li>
          </ul>
        </div>
        <DocsCallout title="Unknown is not the same as malicious" tone="info">
          New and low-visibility projects may not have established reputation data. Treat unknown context as uncertainty unless separate evidence supports a stronger warning.
        </DocsCallout>
      </section>

      <section id="transaction" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <FileCode2 className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">4. Decode transaction intent before signing</h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Transaction review focuses on what the wallet request appears to authorize. On EVM surfaces that can include approval-style payloads, permit or typed-data semantics, wallet call batches, spender context, and decoded asset impact. On Solana surfaces it can include recognized instructions, program context, transfer or authority actions, and preserved unknown instruction context for human review.
        </p>
        <DocsCallout title="Decoded intent is not an execution receipt" tone="warning">
          ScamGuard explains what the supplied request appears capable of doing. It does not claim that the transaction has already executed, succeeded, or produced a final on-chain state unless that separate evidence actually exists.
        </DocsCallout>
      </section>

      <section id="channels" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Use the same safety model where people actually act</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          The public scanner is useful for one-off checks. The browser extension brings warnings closer to Web3 browsing and signing. Telegram protection supports chat-native scans and managed community workflows. Product teams can use authenticated API endpoints for their own interfaces.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            [Chrome, "Browser extension", "Review page and wallet-request context during normal Web3 browsing.", "/extension"],
            [Bot, "Telegram", "Scan suspicious items in chat and protect communities with Group Guardian workflows.", "/telegram"],
            [Braces, "Partner API", "Embed consistent ScamGuard decisions into wallets, launchpads, campaign platforms, or dApps.", "/docs/api"],
          ].map(([Icon, title, text, href]) => (
            <Link key={String(href)} href={String(href)} className="group rounded-xl border border-border/75 bg-card/25 p-4 transition-colors hover:border-primary/30">
              <Icon className="size-4 text-primary" />
              <h3 className="mt-3 text-sm font-semibold group-hover:text-primary">{String(title)}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">Open guide <ArrowRight className="size-3.5" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section id="limitations" className="mt-14 scroll-mt-24">
        <div className="flex items-center gap-2.5">
          <CircleAlert className="size-5 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Know what a clean result cannot promise</h2>
        </div>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
          {[
            "A clean result means no major danger signal was found from available evidence; it is not a guarantee of safety.",
            "Provider outages, inaccessible pages, blocked passive inspection, or incomplete chain history reduce evidence coverage and should be surfaced as limitations.",
            "Unknown domains and counterparties are not automatically malicious.",
            "Verified source context should not suppress dangerous approval or transaction intent.",
            "Never paste seed phrases, private keys, recovery phrases, or other secrets into a scanner. A site requesting them is itself a critical warning sign.",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <DocsNextLinks
        items={[
          {
            href: "/extension",
            label: "Install browser protection",
            description: "Bring ScamGuard context into the browsing and signing surface.",
          },
          {
            href: "/docs/integrations",
            label: "Embed Tri-Proof in your product",
            description: "Choose the API, SDK, OpenAPI contract, or webhook workflow that fits your integration.",
          },
        ]}
      />
    </ProductDocsShell>
  )
}
