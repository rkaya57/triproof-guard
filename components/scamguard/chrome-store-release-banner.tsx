import { ExternalLink, Puzzle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { scamGuardChromeWebStoreUrl } from "@/lib/scamguard/links"

export function ChromeStoreReleaseBanner() {
  return (
    <section className="border-b border-emerald-400/20 bg-emerald-400/[0.045]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
            <Puzzle className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-white">ScamGuard Web3 Shield is live on the Chrome Web Store</p>
              <Badge variant="outline" className="border-emerald-400/35 bg-emerald-400/10 text-emerald-200">Public release</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
              Install the official browser extension from Chrome Web Store for ScamGuard page checks and pre-sign protection.
            </p>
          </div>
        </div>
        <a href={scamGuardChromeWebStoreUrl} target="_blank" rel="noopener noreferrer" className={`${buttonVariants()} glow-primary shrink-0`}>
          Add to Chrome <ExternalLink data-icon="inline-end" />
        </a>
      </div>
    </section>
  )
}
