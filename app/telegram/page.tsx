import Link from "next/link"
import { ArrowRight, Bot, CircleAlert, ListChecks, ScanSearch, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "ScamGuard Security Center | Tri-Proof Guard",
  description: "Use ScamGuard from Telegram to scan Web3 targets, manage watched infrastructure, and protect community chats.",
}

export default function TelegramSecurityCenterPage() {
  return (
    <main className="min-h-screen bg-background">
      <PublicTopNav />
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 sm:py-16">
        <section className="relative overflow-hidden rounded-lg border border-primary/30 bg-card/75 px-6 py-10 shadow-2xl sm:px-10">
          <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary"><Bot /> Telegram security center</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">Security decisions, wherever your community talks.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Send a URL, wallet, token, contract, or transaction payload to ScamGuard Bot. It turns evidence into a clear pre-sign decision and keeps a private watchlist for the targets you care about.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/scamguard" className={buttonVariants()}><ScanSearch /> Open live scanner <ArrowRight /></Link>
            <Link href="/threat-reports" className={buttonVariants({ variant: "outline" })}><CircleAlert /> Browse Threat Pool</Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="premium-card border-primary/25"><CardHeader><ShieldCheck className="size-6 text-primary" /><CardTitle>Private scans</CardTitle><CardDescription>Send or forward suspicious content. The bot classifies the target, explains the signal, and links the full scanner.</CardDescription></CardHeader><CardContent><code className="text-xs text-primary">/scan https://example.com</code></CardContent></Card>
          <Card className="premium-card border-primary/25"><CardHeader><ListChecks className="size-6 text-primary" /><CardTitle>Watchlist</CardTitle><CardDescription>Use <code>/watch</code> to save a target and get an observation-based alert when a later scan finds high-risk behavior.</CardDescription></CardHeader><CardContent><code className="text-xs text-primary">/watchlist</code></CardContent></Card>
          <Card className="premium-card border-primary/25"><CardHeader><Bot className="size-6 text-primary" /><CardTitle>Group Guardian</CardTitle><CardDescription>Add the bot to a connected Telegram group to inspect posted links, spot recurring campaigns, and notify admins at your chosen threshold.</CardDescription></CardHeader><CardContent><code className="text-xs text-primary">/guardian</code></CardContent></Card>
        </section>

        <Card className="border-yellow-400/25 bg-yellow-400/5"><CardHeader><CardTitle className="text-xl">Before you sign</CardTitle><CardDescription className="leading-7">ScamGuard is an evidence layer, not a custody product. Never send seed phrases or private keys, and always compare the wallet prompt with the action you intended to take.</CardDescription></CardHeader></Card>
        <div className="flex flex-wrap gap-3"><Link href="/learn" className={buttonVariants()}>Open product training <ArrowRight /></Link><Link href="/docs" className={buttonVariants({ variant: "outline" })}>Read API documentation</Link></div>
      </div>
    </main>
  )
}
