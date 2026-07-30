import Link from "next/link"
import { CircleDollarSign, Coins, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react"

import { getAdminUser } from "@/lib/auth/admin"
import { subscriptionPlans } from "@/lib/billing/plans"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function ConfigState({ label, configured, required = true }: { label: string; configured: boolean; required?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/45 p-4">
      <div><p className="font-medium text-white">{label}</p><p className="mt-1 text-xs text-slate-400">{required ? "Required for live checkout" : "Recommended for more reliable SOL pricing"}</p></div>
      <Badge variant="outline" className={configured ? "border-green-400/30 text-green-200" : required ? "border-red-400/30 text-red-200" : "border-yellow-400/30 text-yellow-100"}>{configured ? "Configured" : required ? "Missing" : "Optional"}</Badge>
    </div>
  )
}

export default async function PaymentsAdminPage() {
  const admin = await getAdminUser()
  if (!admin) {
    return <Card className="glass-panel"><CardHeader><CardTitle>Admin access required</CardTitle><CardDescription>Only approved Tri-Proof admins can inspect payment configuration.</CardDescription></CardHeader><CardContent><Link href="/dashboard" className={buttonVariants()}>Back to Dashboard</Link></CardContent></Card>
  }

  const treasuryConfigured = Boolean(process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS?.trim())
  const usdcMintConfigured = Boolean(process.env.SOLANA_USDC_MINT?.trim())
  const accessPassConfigured = Boolean(process.env.ACCESS_PASS_SIGNING_SECRET?.trim())
  const priceFeedConfigured = Boolean(process.env.COINGECKO_DEMO_API_KEY?.trim())

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary"><CircleDollarSign className="size-3.5" /> Solana checkout operations</Badge>
        <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">USDC and SOL access passes</h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">Payments are accepted only on Solana mainnet. The server verifies each successful on-chain transfer before activating a 30-day product plan.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" /> Runtime configuration</CardTitle><CardDescription>Values are intentionally hidden. Set or rotate them in Vercel Environment Variables.</CardDescription></CardHeader><CardContent className="grid gap-3">
          <ConfigState label="Solana treasury address" configured={treasuryConfigured} />
          <ConfigState label="Solana USDC mint" configured={usdcMintConfigured} />
          <ConfigState label="Access pass signing secret" configured={accessPassConfigured} />
          <ConfigState label="CoinGecko Demo API key" configured={priceFeedConfigured} required={false} />
        </CardContent></Card>

        <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2"><Coins className="text-primary" /> Live plan ledger</CardTitle><CardDescription>Plan values use a USDC denomination. SOL checkout uses a signed, 15-minute live equivalent.</CardDescription></CardHeader><CardContent className="grid gap-3">
          {Object.values(subscriptionPlans).map((plan) => <div key={plan.id} className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-4"><div><p className="font-medium text-white">{plan.name}</p><p className="mt-1 text-xs text-slate-400">{plan.id === "free" ? "Daily basic scan allowance" : "30-day access pass"}</p></div><p className="text-xl font-semibold text-primary">{plan.id === "free" ? "$0" : `${plan.amountUsdc} USDC`}</p></div>)}
        </CardContent></Card>
      </section>

      <Card className="glass-panel premium-card border-primary/25"><CardHeader><CardTitle className="flex items-center gap-2"><TriangleAlert className="text-yellow-300" /> Operating notes</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm text-muted-foreground"><p>Never paste treasury secrets or API keys into the product UI. Only the public treasury address is sent to a payer wallet.</p><p>USDC payments are checked against the configured mint and treasury token account. Native SOL payments are checked against a user-bound, signed quote and direct treasury transfer.</p><div className="flex flex-wrap gap-3 pt-2"><Link href="/pricing" className={buttonVariants({ variant: "outline" })}>Open pricing</Link><Link href="/admin/diagnostics" className={buttonVariants({ variant: "outline" })}>Open diagnostics <ExternalLink data-icon="inline-end" /></Link></div></CardContent></Card>
    </div>
  )
}
