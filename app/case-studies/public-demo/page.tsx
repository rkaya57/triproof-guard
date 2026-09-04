import Link from "next/link"
import { ArrowRight, CheckCircle2, FileText, Radar, ShieldCheck, TriangleAlert } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Public Validation Study | Tri-Proof Protocol",
  description: "A reproducible walkthrough of the Tri-Proof Sybil Analyst public demo dataset and decision report.",
}

const outcomes = [
  ["20", "Wallets analyzed", "A small public dataset designed to make the report structure easy to inspect."],
  ["6", "Approved", "Wallets suitable for inclusion based on the evidence available in the demo."],
  ["5", "Gray-zone review", "Wallets intentionally routed to human review instead of an automatic decision."],
  ["9", "Rejected / not eligible", "Wallets excluded from automatic reward inclusion for risk, inactivity, or entity reasons."],
] as const

const method = [
  ["1", "Submit the wallet list", "The public CSV is processed through the same decision structure shown in the sample report."],
  ["2", "Evaluate available evidence", "Wallet history, entity context, behavior, policy, and relationship signals are considered where present."],
  ["3", "Separate certainty from ambiguity", "Clear outcomes are separated from gray-zone wallets that require project-side review."],
  ["4", "Export an auditable result", "The output shows decision counts, representative reasons, and downloadable sample artifacts."],
] as const

export default function PublicValidationCaseStudyPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="outline" className="mb-5 w-fit border-primary/30 bg-primary/5 text-primary">Public validation study</Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">How a public wallet dataset becomes an explainable campaign decision.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">This reproducible validation example shows how Sybil Analyst organizes approved, gray-zone, and rejected/not-eligible results. It demonstrates the workflow and evidence structure; it is not presented as a customer endorsement.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link href="/demo/report" className={buttonVariants()}>Open the sample report <ArrowRight data-icon="inline-end" /></Link><Link href="/audit" className={buttonVariants({ variant: "outline" })}>Run a free mini audit</Link></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {outcomes.map(([value, label, detail]) => (
            <Card key={label} className="glass-panel premium-card"><CardHeader><CardTitle className="text-gradient text-3xl">{value}</CardTitle><CardDescription>{label}</CardDescription></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">{detail}</CardContent></Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="glass-panel premium-card">
            <CardHeader><TriangleAlert className="size-6 text-yellow-200" /><CardTitle>What this validation shows</CardTitle><CardDescription className="leading-7">The dataset demonstrates the report path, decision taxonomy, human-review boundary, and downloadable evidence artifacts. Production scale and business impact should be measured in a real campaign pilot.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              {["The sample dataset is publicly downloadable.", "Decision categories and representative reasons are visible.", "Gray-zone handling demonstrates human-review boundaries.", "CSV and JSON artifacts can be inspected independently."].map((item) => <div key={item} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item}</span></div>)}
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {method.map(([number, title, text]) => (
              <div key={number} className="rounded-2xl border border-border bg-background/55 p-5"><span className="font-mono text-sm font-semibold text-primary">{number}</span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="glass-panel premium-card"><CardHeader><Radar className="size-6 text-primary" /><CardTitle>Decision categories</CardTitle><CardDescription>Approved, gray-zone, and rejected/not-eligible outcomes make uncertainty visible instead of hiding it in one score.</CardDescription></CardHeader></Card>
          <Card className="glass-panel premium-card"><CardHeader><FileText className="size-6 text-primary" /><CardTitle>Inspectable artifacts</CardTitle><CardDescription>The sample report links downloadable CSV and JSON artifacts for direct inspection.</CardDescription></CardHeader></Card>
          <Card className="glass-panel premium-card"><CardHeader><ShieldCheck className="size-6 text-primary" /><CardTitle>Next validation step</CardTitle><CardDescription>A real pilot can measure list size, review rate, cluster findings, operational time saved, and project-confirmed outcomes.</CardDescription></CardHeader></Card>
        </div>
        <div className="mt-10 rounded-2xl border border-primary/25 bg-primary/5 p-7">
          <h2 className="text-2xl font-semibold">Run a real pilot with your campaign.</h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">Use your own participant list to measure review rate, suspicious clusters, decision quality, and operational time saved. Verified pilot metrics can then support a customer case study with permission.</p>
          <Link href="/contact?topic=pilot-case-study" className={`${buttonVariants()} mt-6`}>Request a pilot review <ArrowRight data-icon="inline-end" /></Link>
        </div>
      </section>
    </main>
  )
}
