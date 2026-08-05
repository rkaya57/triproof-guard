import Link from "next/link"
import { ArrowRight, Bot, CircleAlert, ListChecks, ScanSearch, ShieldCheck, Users } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { scamGuardTelegramBotUrl } from "@/lib/telegram/links"

export const metadata = {
  title: "Telegram ScamGuard & Group Guardian | Tri-Proof Protocol",
  description: "Open the ScamGuard Telegram bot or protect a community with Tri-Proof Group Guardian.",
}

export default function TelegramSecurityCenterPage() {
  return (
    <main className="min-h-screen bg-background">
      <PublicTopNav />
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 sm:py-16">
        <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card/75 px-6 py-10 shadow-2xl sm:px-10">
          <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary"><Bot /> Telegram security center</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">Security decisions, wherever your community talks.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Send a URL, wallet, token, contract, or transaction payload directly to ScamGuard Bot. Community teams can add Group Guardian to monitor posted risks and apply an admin-controlled response policy.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={buttonVariants()}><Bot /> Open ScamGuard Bot <ArrowRight /></a>
            <Link href="/checkout?plan=community" className={buttonVariants({ variant: "outline" })}><Users /> Protect My Community</Link>
            <Link href="/pricing#community" className={buttonVariants({ variant: "ghost" })}>View Community Plan</Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="premium-card border-primary/25"><CardHeader><ShieldCheck className="size-6 text-primary" /><CardTitle>Private scans</CardTitle><CardDescription>Send or forward suspicious content. The bot classifies the target, explains the signal, and links the full report.</CardDescription></CardHeader><CardContent><code className="text-xs text-primary">/scan https://example.com</code></CardContent></Card>
          <Card className="premium-card border-primary/25"><CardHeader><ListChecks className="size-6 text-primary" /><CardTitle>Watchlist</CardTitle><CardDescription>Use <code>/watch</code> to save a target and receive an observation-based alert when later evidence becomes high risk.</CardDescription></CardHeader><CardContent><code className="text-xs text-primary">/watchlist</code></CardContent></Card>
          <Card className="premium-card border-primary/25"><CardHeader><Bot className="size-6 text-primary" /><CardTitle>Group Guardian</CardTitle><CardDescription>Add the bot to a connected Telegram group to inspect posted links, identify recurring campaigns, and notify administrators at the selected threshold.</CardDescription></CardHeader><CardContent><code className="text-xs text-primary">/guardian</code></CardContent></Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="border-primary/25 bg-primary/5"><CardHeader><ScanSearch className="size-6 text-primary" /><CardTitle>Need the web workspace?</CardTitle><CardDescription className="leading-7">The ScamGuard web scanner includes richer evidence views and history. Account sign-in is required before a scan starts.</CardDescription></CardHeader><CardContent><Link href="/scamguard" className={buttonVariants({ variant: "outline" })}>Sign in to open Scanner <ArrowRight /></Link></CardContent></Card>
          <Card className="border-yellow-400/25 bg-yellow-400/5"><CardHeader><CircleAlert className="size-6 text-yellow-200" /><CardTitle>Before you sign</CardTitle><CardDescription className="leading-7">ScamGuard is an evidence layer, not a custody product. Never send seed phrases or private keys, and always compare the wallet prompt with the intended action.</CardDescription></CardHeader></Card>
        </section>

        <div className="flex flex-wrap gap-3">
          <a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={buttonVariants()}><Bot /> Add Bot to Telegram</a>
          <Link href="/threat-reports" className={buttonVariants({ variant: "outline" })}><CircleAlert /> Browse Threat Pool</Link>
          <Link href="/docs" className={buttonVariants({ variant: "outline" })}>Read security documentation</Link>
        </div>
      </div>
    </main>
  )
}
