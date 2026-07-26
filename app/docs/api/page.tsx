import Link from "next/link"
import { ArrowRight, Code2, KeyRound, ServerCog, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const createExample = `curl -X POST https://triproofprotocol.com/api/v1/analyze \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "chain": "Solana",
    "projectName": "Solana Campaign Audit",
    "campaignType": "Airdrop",
    "riskPolicy": "balanced",
    "analysisMode": "onchain",
    "wallets": [
      "Ch8kCo2FW4HXQMTm2wpbLeaVZJxXa4Rg8S4KVXUxcdVm",
      "DJt9LW4Mma6q5dgE7gXaVmHi8Msjcax1D4wQ78RCDfcw"
    ]
  }'`

const statusExample = `curl https://triproofprotocol.com/api/v1/analysis/ANALYSIS_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"`

const scamGuardExample = `curl -X POST https://triproofprotocol.com/api/v1/scamguard/scan \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "type": "transaction",
    "chain": "evm",
    "value": "{\\"method\\":\\"eth_sendTransaction\\",\\"data\\":\\"0x095ea7b3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\\"}",
    "walletAddress": "0x0000000000000000000000000000000000000000"
  }'`

const feedbackExample = `curl -X POST https://triproofprotocol.com/api/scamguard/feedback \\
  -H "Content-Type: application/json" \\
  -d '{
    "scanId": "SCAN_ID",
    "verdict": "false_positive",
    "reason": "Official project domain confirmed by team."
  }'`

export const metadata = {
  title: "Tri-Proof Guard API Docs",
  description: "V1.9 API documentation for wallet risk analyses, ScamGuard scans and analysis status.",
}

export default function ApiDocsPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 border-primary/30 text-primary">V1.9 API Endpoint</Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">
            Create wallet risk analyses from your own workflow.
          </h1>
          <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
            The V1 API lets campaign teams submit wallet lists, queue real on-chain enrichment, run multichain ScamGuard scans, and retrieve decision summaries programmatically.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/api/v1" className={`${buttonVariants()} glow-primary`}>Open API index <ArrowRight data-icon="inline-end" /></Link>
            <Link href="/demo/report" className={buttonVariants({ variant: "outline" })}>View sample report</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 sm:px-8 lg:grid-cols-4">
        <Card className="glass-panel premium-card">
          <CardHeader><KeyRound className="text-primary" /><CardTitle>Authentication</CardTitle><CardDescription>Use a dashboard session or an API key header.</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Set TRIPROOF_API_KEY and TRIPROOF_API_USER_EMAIL in Vercel for server-to-server use.</CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ServerCog className="text-primary" /><CardTitle>Create analysis</CardTitle><CardDescription>POST /api/v1/analyze</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Queues the wallet list into the same batch worker used by the dashboard.</CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><Code2 className="text-primary" /><CardTitle>Read status</CardTitle><CardDescription>GET /api/v1/analysis/ANALYSIS_ID</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Returns summary counts, top wallet decisions, clusters and export URLs.</CardContent>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader><ShieldAlert className="text-primary" /><CardTitle>ScamGuard scan</CardTitle><CardDescription>POST /api/v1/scamguard/scan</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Scans URLs, wallets, token mints and pre-sign transaction intent through one endpoint.</CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="glass-panel premium-card">
            <CardHeader><CardTitle>Create analysis example</CardTitle><CardDescription>Submit wallets and choose a risk policy.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{createExample}</code></pre></CardContent>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><CardTitle>Status example</CardTitle><CardDescription>Poll until the analysis status is completed.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{statusExample}</code></pre></CardContent>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><CardTitle>ScamGuard example</CardTitle><CardDescription>Scan before a wallet or dApp asks the user to sign.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{scamGuardExample}</code></pre></CardContent>
          </Card>
          <Card className="glass-panel premium-card">
            <CardHeader><CardTitle>Feedback example</CardTitle><CardDescription>Feed false positives and scam reports back into ScamGuard review.</CardDescription></CardHeader>
            <CardContent><pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-xs text-muted-foreground"><code>{feedbackExample}</code></pre></CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}
