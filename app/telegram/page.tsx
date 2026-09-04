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
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_0.78fr] lg:items-center lg:py-20">
          <div>
            <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary"><Bot /> Telegram security center</Badge>
            <h1 className="text-gradient mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">Security decisions, wherever your community talks.</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">Send a URL, wallet, token, contract, or transaction payload directly to ScamGuard Bot. Community teams can add Group Guardian to monitor posted risks and apply an admin-controlled response policy.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={`${buttonVariants()} glow-primary`}><Bot /> Open ScamGuard Bot <ArrowRight /></a>
              <Link href="/checkout?plan=community" className={buttonVariants({ variant: "outline" })}><Users /> Protect my community</Link>
              <Link href="/pricing#community" className={buttonVariants({ variant: "ghost" })}>View Community plan</Link>
            </div>
          </div>

          <div className="glass-panel premium-card rounded-3xl p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
              <div>
                <p className="font-semibold text-white">Group Guardian</p>
                <p className="mt-1 text-xs text-muted-foreground">Admin-controlled Telegram protection</p>
              </div>
              <Badge variant="outline" className="border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-200"><span className="pulse-dot mr-1.5" /> Live workflow</Badge>
            </div>
            <div className="mt-5 grid gap-3">
              {[
                ["1", "Connect the group", "Authorize one Telegram group from the Developer workspace."],
                ["2", "Choose the threshold", "Set caution, high-risk, or critical alert behavior."],
                ["3", "Review repeated threats", "See recurring targets and apply moderator actions when required."],
              ].map(([step, title, text]) => (
                <div key={step} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-black/10 p-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-cyan-300/14 bg-cyan-300/[0.04] font-mono text-[10px] text-cyan-200">{step}</span>
                  <div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass-panel premium-card"><CardHeader><ShieldCheck className="size-6 text-primary" /><CardTitle>Private scans</CardTitle><CardDescription>Send or forward suspicious content. The bot classifies the target, explains the signal, and links the full report.</CardDescription></CardHeader><CardContent><code className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary">/scan https://example.com</code></CardContent></Card>
          <Card className="glass-panel premium-card"><CardHeader><ListChecks className="size-6 text-primary" /><CardTitle>Watchlist</CardTitle><CardDescription>Use <code>/watch</code> to save a target and receive an observation-based alert when later evidence becomes high risk.</CardDescription></CardHeader><CardContent><code className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary">/watchlist</code></CardContent></Card>
          <Card className="glass-panel premium-card"><CardHeader><Bot className="size-6 text-primary" /><CardTitle>Group Guardian</CardTitle><CardDescription>Add the bot to a connected Telegram group to inspect posted links, identify recurring campaigns, and notify administrators at the selected threshold.</CardDescription></CardHeader><CardContent><code className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary">/guardian</code></CardContent></Card>
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.025]">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 md:grid-cols-2">
          <Card className="glass-panel premium-card border-primary/20"><CardHeader><ScanSearch className="size-6 text-primary" /><CardTitle>Need the web workspace?</CardTitle><CardDescription className="leading-7">The ScamGuard web scanner includes richer evidence views and history. Account sign-in is required before a scan starts.</CardDescription></CardHeader><CardContent><Link href="/scamguard" className={buttonVariants({ variant: "outline" })}>Sign in to open Scanner <ArrowRight /></Link></CardContent></Card>
          <Card className="glass-panel premium-card border-yellow-400/20 bg-yellow-400/[0.035]"><CardHeader><CircleAlert className="size-6 text-yellow-200" /><CardTitle>Before you sign</CardTitle><CardDescription className="leading-7">ScamGuard is an evidence layer, not a custody product. Never send seed phrases or private keys, and always compare the wallet prompt with the intended action.</CardDescription></CardHeader></Card>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-5 py-14 sm:px-8 lg:flex-row lg:items-center">
        <div><h2 className="text-2xl font-semibold text-white">Protect a chat, a group, or a signing decision.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Start with the official bot, inspect the community threat pool, or read the security methodology before enabling group automation.</p></div>
        <div className="flex flex-wrap gap-3">
          <a href={scamGuardTelegramBotUrl} target="_blank" rel="noreferrer" className={buttonVariants()}><Bot /> Add Bot to Telegram</a>
          <Link href="/threat-reports" className={buttonVariants({ variant: "outline" })}><CircleAlert /> Browse Threat Pool</Link>
          <Link href="/docs" className={buttonVariants({ variant: "outline" })}>Read security docs</Link>
        </div>
      </section>
    </main>
  )
}
