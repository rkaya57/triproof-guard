import Link from "next/link"
import { ArrowRight, Clock, RefreshCcw, ServerCog } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const analysisWorker = `curl -X POST "https://triproofprotocol.com/api/worker/analysis-queue?maxBatches=5&timeBudgetMs=25000&recoverStale=true" \\
  -H "Authorization: Bearer YOUR_WORKER_SECRET"`

const queueStatus = `curl "https://triproofprotocol.com/api/worker/analysis-queue" \\
  -H "Authorization: Bearer YOUR_WORKER_SECRET"`

const webhookRetry = `curl -X POST "https://triproofprotocol.com/api/worker/webhook-retry?limit=10&maxAttempts=3" \\
  -H "Authorization: Bearer YOUR_WORKER_SECRET"`

export const metadata = {
  title: "Tri-Proof Queue Workers",
  description: "V2.4 large-scale queue optimization and worker documentation for Tri-Proof Guard.",
}

export default function QueueDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 text-primary">V2.4 Queue Optimization</Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">Scale large wallet analyses with safer workers.</h1>
          <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">V2.4 adds multi-batch processing, stale batch recovery, queue status checks, and webhook retry workers for production reliability.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/docs/api" className={`${buttonVariants()} glow-primary`}>API docs <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/docs/webhooks" className={buttonVariants({ variant: "outline" })}>Webhook docs</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-3">
        <Card className="glass-panel premium-card"><CardHeader><ServerCog className="text-primary" /><CardTitle>Multi-batch worker</CardTitle><CardDescription>Processes up to maxBatches in one request with a time budget.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><Clock className="text-primary" /><CardTitle>Stale recovery</CardTitle><CardDescription>Processing batches older than the stale threshold are returned to the queue or failed after retries.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><RefreshCcw className="text-primary" /><CardTitle>Webhook retry</CardTitle><CardDescription>Failed or pending webhook deliveries can be retried by a worker call.</CardDescription></CardHeader></Card>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-16 sm:px-8 lg:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Run analysis queue</CardTitle><CardDescription>Recommended for Vercel Cron every 1–5 minutes.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{analysisWorker}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Queue status</CardTitle><CardDescription>Returns pending, processing, completed, failed, and stale counts.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{queueStatus}</code></pre></CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>Webhook retry</CardTitle><CardDescription>Retries pending/failed deliveries below maxAttempts.</CardDescription></CardHeader>
          <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{webhookRetry}</code></pre></CardContent>
        </Card>
      </section>
    </main>
  )
}
