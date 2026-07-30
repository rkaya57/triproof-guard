import Link from "next/link"
import { Activity, ArrowRight, Database, ServerCog, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const healthApi = `curl https://triproofprotocol.com/api/health`
const adminDiagnostics = `https://triproofprotocol.com/admin/diagnostics`
const migrations = `npx prisma generate
npx prisma migrate deploy`

export const metadata = {
  title: "Tri-Proof Production Hardening",
  description: "V2.5 production health checks, diagnostics and operational readiness for Tri-Proof Guard.",
}

export default function ProductionDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 bg-primary/10 text-cyan-100">V2.5 Production Hardening</Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">Keep the production app observable.</h1>
          <p className="mt-5 max-w-2xl leading-7 text-slate-300">
            V2.5 adds health checks for the database, migrations, on-chain providers, analysis queue, webhooks and critical environment variables.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/admin/diagnostics" className={`${buttonVariants()} glow-primary`}>Open diagnostics <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/api/health" className={`${buttonVariants({ variant: "outline" })} text-white`}>Health API</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <Card className="glass-panel premium-card"><CardHeader><Database className="text-primary" /><CardTitle className="text-white">DB readiness</CardTitle><CardDescription className="text-slate-300">Checks connection and required production tables.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><Activity className="text-primary" /><CardTitle className="text-white">Provider readiness</CardTitle><CardDescription className="text-slate-300">Checks Solana provider selection and enrichment config.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><ServerCog className="text-primary" /><CardTitle className="text-white">Queue health</CardTitle><CardDescription className="text-slate-300">Surfaces stale, failed, pending and processing batches.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><ShieldCheck className="text-primary" /><CardTitle className="text-white">Webhook health</CardTitle><CardDescription className="text-slate-300">Surfaces pending and failed delivery state.</CardDescription></CardHeader></Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-16 sm:px-8 lg:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="text-white">Public health API</CardTitle><CardDescription className="text-slate-300">Returns HTTP 503 if a critical production check fails.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-slate-300"><code>{healthApi}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="text-white">Admin diagnostics</CardTitle><CardDescription className="text-slate-300">Login-required visual diagnostics dashboard.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-slate-300"><code>{adminDiagnostics}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="text-white">Migration command</CardTitle><CardDescription className="text-slate-300">Run after schema/model changes before customer testing.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-slate-300"><code>{migrations}</code></pre></CardContent>
        </Card>
      </section>
    </main>
  )
}
