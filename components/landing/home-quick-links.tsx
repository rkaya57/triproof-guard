import Link from "next/link"
import { Mail, Puzzle, Send } from "lucide-react"

import { scamGuardChromeWebStoreUrl } from "@/lib/scamguard/links"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

const officialXUrl = "https://x.com/TriProof_"

const sharedLinkClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/80 px-3 text-sm font-medium text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/55 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"

export function HomeQuickLinks() {
  return (
    <aside
      aria-label="Tri-Proof Protocol official channels"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex justify-center lg:inset-x-auto lg:bottom-6 lg:right-6"
    >
      <div className="glass-panel pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-primary/25 bg-background/90 p-2 shadow-2xl backdrop-blur-xl lg:flex-col lg:items-stretch">
        <span className="hidden px-2 pb-1 pt-1 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground lg:block">
          Official channels
        </span>

        <a
          href={officialXUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedLinkClass}
          aria-label="Open Tri-Proof Protocol on X"
        >
          <span aria-hidden className="flex size-4 items-center justify-center font-bold">X</span>
          <span className="hidden sm:inline">@TriProof_</span>
        </a>

        <a
          href={scamGuardChromeWebStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedLinkClass}
          aria-label="Open ScamGuard Web3 Shield in the Chrome Web Store"
        >
          <Puzzle aria-hidden className="size-4" />
          <span className="hidden sm:inline">Add to Chrome</span>
        </a>

        <a
          href={scamGuardTelegramBotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedLinkClass}
          aria-label="Open Tri-Proof Protocol Telegram bot"
        >
          <Send aria-hidden className="size-4" />
          <span className="hidden sm:inline">Telegram</span>
        </a>

        <Link
          href="/contact"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_rgba(56,189,248,0.22)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          aria-label="Contact the Tri-Proof Protocol team"
        >
          <Mail aria-hidden className="size-4" />
          <span>Contact</span>
        </Link>
      </div>
    </aside>
  )
}
