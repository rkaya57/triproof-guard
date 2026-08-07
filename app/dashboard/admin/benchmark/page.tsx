import Link from "next/link"
import {
  Download,
  EyeOff,
  FileCheck2,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"
import { buildRepresentativeReviewerQueue } from "@/lib/benchmark/reviewer-export"

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">
          Blind benchmark exports are restricted to approved Tri-Proof admins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </CardContent>
    </Card>
  )
}

export default async function DashboardAdminBenchmarkPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  const queue = await buildRepresentativeReviewerQueue(20)
  const chainSummary = Object.entries(queue.summary.byChain)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([chain, count]) => `${chain}: ${count}`)
    .join(" · ")

  return (
    <div className="flex flex-col gap-8">
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge
            variant="secondary"
            className="border-primary/30 bg-primary/10 text-cyan-100"
          >
            Real-World Blind Validation v2
          </Badge>
          <Badge
            variant="outline"
            className="border-green-400/30 bg-green-400/10 text-green-200"
          >
            ENGINE-BLIND
          </Badge>
        </div>

        <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-5xl">
          Blind Review Queue
        </h1>
        <p className="mt-5 max-w-3xl text-slate-300">
          Download the representative reviewer file without exposing Tri-Proof
          decisions, scores, clusters, reason codes, entity labels, or hidden
          bot/behavior scores.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-3xl font-semibold text-white">
              {queue.summary.uniqueRepresentativeCases}
            </p>
            <p className="mt-1 text-sm text-slate-400">Representative cases</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-3xl font-semibold text-white">
              {queue.summary.candidatePool}
            </p>
            <p className="mt-1 text-sm text-slate-400">Eligible candidate records</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-3xl font-semibold text-white">
              {queue.summary.projects}
            </p>
            <p className="mt-1 text-sm text-slate-400">Projects represented</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-lg font-semibold text-white">{chainSummary || "—"}</p>
            <p className="mt-1 text-sm text-slate-400">Chain distribution</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/api/admin/benchmark/reviewer-queue?perProject=20"
            className={`${buttonVariants()} glow-primary`}
          >
            <Download data-icon="inline-start" /> Download reviewer CSV
          </Link>
          <Link
            href="/dashboard/admin"
            className={`${buttonVariants({ variant: "outline" })} text-white`}
          >
            Back to admin
          </Link>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <EyeOff className="mb-2 size-5 text-primary" />
            <CardTitle className="text-white">1. Keep it blind</CardTitle>
            <CardDescription className="text-slate-300">
              Send only the downloaded reviewer CSV. Do not show the reviewer
              any Tri-Proof dashboard result for these wallets.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <UsersRound className="mb-2 size-5 text-primary" />
            <CardTitle className="text-white">2. Independent review</CardTitle>
            <CardDescription className="text-slate-300">
              The reviewer inspects the public explorer link and observable
              evidence, then assigns a ground-truth label independently.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <FileCheck2 className="mb-2 size-5 text-primary" />
            <CardTitle className="text-white">3. Complete every field</CardTitle>
            <CardDescription className="text-slate-300">
              Fill label, expected decision, acceptable decisions, malicious
              expectation, reviewer, timestamp, confidence, and rationale.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <ShieldCheck className="mb-2 size-5 text-primary" />
            <CardTitle className="text-white">4. Double-review malicious labels</CardTitle>
            <CardDescription className="text-slate-300">
              Representative Sybil or bot labels require two independent named
              reviewers before they can count toward external accuracy claims.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card className="glass-panel premium-card border-yellow-400/25">
        <CardHeader>
          <CardTitle className="text-yellow-100">Reviewer label guide</CardTitle>
          <CardDescription className="text-slate-300">
            Use evidence, not intuition. When the chain evidence cannot support a
            reliable conclusion, choose insufficient_data instead of guessing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-border p-3">
            <strong className="text-white">organic_user</strong>
            <p className="mt-1">Normal independent participant behavior.</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <strong className="text-white">sybil</strong>
            <p className="mt-1">Coordinated multi-wallet participation supported by evidence.</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <strong className="text-white">bot</strong>
            <p className="mt-1">Automation/scripted participant behavior supported by evidence.</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <strong className="text-white">non_user_entity</strong>
            <p className="mt-1">Exchange, protocol, contract, bridge, treasury, or service account.</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <strong className="text-white">insufficient_data</strong>
            <p className="mt-1">Available evidence is not enough for a reliable label.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
