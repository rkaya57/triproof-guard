import Link from "next/link"
import { ArrowRight, CheckCircle2, Download, FileJson, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const summaryCards = [
  ["20", "Total wallets", "Public demo dataset"],
  ["6", "Approved", "Reward candidates"],
  ["5", "Gray Zone", "Project-side review"],
  ["9", "Rejected / Not Eligible", "Excluded candidates"],
]

const sampleRows = [
  ["EPjF...t1v", "75", "Rejected / Not Eligible", "Known token mint / protocol entity"],
  ["7JN...D42", "55", "Gray Zone", "V1.4 needs_review policy"],
  ["58B...DLg", "31", "Approved", "Low risk after available evidence"],
  ["GDT...C7jT", "45", "Rejected / Not Eligible", "No reliable on-chain history"],
]

const signals = [
  "V1.3 behavior intelligence: low diversity / campaign concentration",
  "V1.4 reputation and project-side policy labels",
  "V1.5 No On-chain Data / Not Eligible language",
  "V1.6 Conservative / Balanced / Strict policy presets",
  "Known Solana program, token mint, and protocol account detection",
]

export const metadata = {
  title: "Tri-Proof Guard Sample Report",
  description: "Public sample report and demo dataset for Tri-Proof Guard wallet risk analysis.",
}

export default function SampleReportPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="border-primary/30 text-primary">
              V1.8 Public Demo
            </Badge>
            <Badge variant="outline">Solana demo dataset</Badge>
          </div>
          <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">
                Sample wallet risk report.
              </h1>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                This page shows how Tri-Proof Guard explains campaign wallet decisions using approved, gray-zone, and rejected/not-eligible outputs. The public CSV can be downloaded and tested in the analysis flow.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link href="/demo/tri-proof-public-demo-wallets.csv" className={`${buttonVariants()} glow-primary`}>
                <Download data-icon="inline-start" /> Download dataset
              </Link>
              <Link href="/demo/tri-proof-sample-report.json" className={buttonVariants({ variant: "outline" })}>
                <FileJson data-icon="inline-start" /> JSON sample
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          {summaryCards.map(([value, label, detail]) => (
            <Card key={label} className="glass-panel premium-card">
              <CardHeader>
                <CardTitle className="text-gradient text-3xl">{value}</CardTitle>
                <CardDescription>{label}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-14 sm:px-8 lg:grid-cols-[0.82fr_1.18fr]">
          <Card className="glass-panel premium-card">
            <CardHeader>
              <ShieldCheck className="text-primary" />
              <CardTitle>How to read the sample</CardTitle>
              <CardDescription>
                Rejected does not always mean malicious. It can also mean not eligible for automatic reward inclusion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">Approved</strong> means the wallet looks eligible based on available evidence.</p>
              <p><strong className="text-foreground">Gray Zone</strong> means the wallet needs project-side review.</p>
              <p><strong className="text-foreground">Rejected / Not Eligible</strong> means the wallet is high-risk, inactive, unreadable, protocol-owned, or otherwise not suitable for automatic reward inclusion.</p>
            </CardContent>
          </Card>

          <Card className="glass-panel premium-card overflow-hidden">
            <CardHeader>
              <CardTitle>Sample decision rows</CardTitle>
              <CardDescription>Representative rows from a public demo report.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[1fr_70px_150px_1.2fr] bg-primary/5 px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Wallet</span><span>Score</span><span>Decision</span><span>Main reason</span>
                </div>
                {sampleRows.map(([wallet, score, decision, reason]) => (
                  <div key={wallet} className="grid grid-cols-[1fr_70px_150px_1.2fr] border-t border-border px-4 py-3 text-sm">
                    <span className="font-mono text-muted-foreground">{wallet}</span>
                    <span>{score}</span>
                    <span className="text-primary">{decision}</span>
                    <span className="text-muted-foreground">{reason}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="mb-8 flex items-center gap-2 text-primary">
          <Sparkles className="size-5" />
          <span className="font-mono text-xs uppercase tracking-[0.2em]">Evidence signals</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {signals.map((signal) => (
            <Card key={signal} className="glass-panel premium-card">
              <CardHeader>
                <CheckCircle2 className="text-primary" />
                <CardTitle className="text-base">{signal}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary`}>
            Run your own analysis <ArrowRight data-icon="inline-end" />
          </Link>
          <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>
            See pricing
          </Link>
        </div>
      </section>
    </main>
  )
}
