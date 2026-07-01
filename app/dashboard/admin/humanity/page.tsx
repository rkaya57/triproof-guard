import Link from "next/link"
import { ArrowRight, BadgeCheck, Camera, Database, Fingerprint, GitBranch, LockKeyhole, ScanFace, ShieldCheck, Wallet } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

const productFlow = [
  [Wallet, "Connect Wallet", "Admin enters or connects an EVM/Solana wallet for a campaign."],
  [Camera, "Verify Humanity", "Sandbox submits derived liveness scores into the real Humanity API."],
  [Fingerprint, "Sign Message", "The API returns a wallet ownership message for the next signing step."],
  [BadgeCheck, "Review Result", "Admin can review approved, gray-zone and rejected verifications."],
]

const mergeChecklist = [
  "Humanity models are added to the main Prisma schema.",
  "Humanity migration is isolated from Guard tables.",
  "Humanity API routes are protected by admin session checks.",
  "Admin sandbox can create sessions and store verification results.",
  "CSV export is available for verification records.",
  "Camera detector and external public demo remain gated until final review.",
]

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">Humanity Gate Lab is only visible to approved Tri-Proof admin email accounts.</CardDescription>
      </CardHeader>
      <CardContent><Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link></CardContent>
    </Card>
  )
}

export default async function HumanityAdminLabPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return (
    <div className="flex flex-col gap-7">
      <section className="dashboard-hero relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-6 shadow-[0_0_80px_rgba(56,189,248,0.08)] sm:p-8">
        <div className="pointer-events-none absolute right-[-5rem] top-[-5rem] size-64 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-7rem] left-1/4 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="border-purple-400/30 bg-purple-400/10 text-purple-100">Admin-only module</Badge>
              <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Controlled sandbox active</Badge>
            </div>
            <h1 className="text-gradient text-4xl font-semibold sm:text-6xl">Tri-Proof Humanity Gate</h1>
            <p className="mt-5 max-w-3xl leading-7 text-slate-300">Humanity Gate now has admin-only database tables, API routes, a sandbox demo and verification exports inside the Guard dashboard.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard/admin/humanity/demo" className={`${buttonVariants()} glow-primary hover-lift`}>Open sandbox <ArrowRight data-icon="inline-end" /></Link>
              <Link href="/dashboard/admin/humanity/verifications" className={`${buttonVariants({ variant: "outline" })} text-white`}>View verifications</Link>
              <a href="https://github.com/rkaya57/triproof-humanity-codex" target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} text-white`}>Source repo</a>
            </div>
          </div>
          <Card className="glass-panel premium-card animated-border border-purple-400/20 bg-purple-400/5">
            <CardHeader>
              <ScanFace className="text-purple-300" />
              <CardTitle className="text-white">Integration status</CardTitle>
              <CardDescription className="text-slate-300">Controlled merge is active for admins.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-xl border border-green-400/20 bg-green-400/10 p-3"><span>Admin route</span><span className="text-green-300">Ready</span></div>
              <div className="flex items-center justify-between rounded-xl border border-green-400/20 bg-green-400/10 p-3"><span>DB/API sandbox</span><span className="text-green-300">Merged</span></div>
              <div className="flex items-center justify-between rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3"><span>Camera detector</span><span className="text-yellow-300">Next phase</span></div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {productFlow.map(([Icon, title, text], index) => (
          <Card key={title as string} className="glass-panel premium-card hover-lift animated-border">
            <CardHeader><div className="mb-2 flex items-center justify-between"><Icon className="text-primary" /><span className="font-mono text-xs text-primary/70">0{index + 1}</span></div><CardTitle className="text-white">{title as string}</CardTitle><CardDescription className="text-slate-300">{text as string}</CardDescription></CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass-panel premium-card animated-border"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" /> Product boundary</CardTitle><CardDescription className="text-slate-300">Humanity Gate is not KYC and does not replace Guard wallet risk scoring.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-slate-300"><p>Humanity Gate verifies human presence at campaign registration and stores derived scores, reason codes, timestamps, wallet address and campaign metadata.</p><p>Guard still handles Sybil detection, wallet clustering, funding-source risk, entity labels and reward eligibility after registration.</p></CardContent></Card>
        <Card className="glass-panel premium-card animated-border"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><GitBranch className="text-primary" /> Controlled merge checklist</CardTitle><CardDescription className="text-slate-300">What is active now.</CardDescription></CardHeader><CardContent className="grid gap-3">{mergeChecklist.map((item) => (<div key={item} className="flex gap-3 rounded-xl border border-border bg-background/45 p-3 text-sm text-slate-300"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item}</span></div>))}</CardContent></Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-panel premium-card"><CardHeader><Database className="text-primary" /><CardTitle className="text-white">Data models merged</CardTitle><CardDescription className="text-slate-300">HumanityCampaign, HumanityChallengeSession and HumanityVerification.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><Camera className="text-primary" /><CardTitle className="text-white">Camera flow next</CardTitle><CardDescription className="text-slate-300">Live browser challenge can be enabled after admin sandbox testing.</CardDescription></CardHeader></Card>
        <Card className="glass-panel premium-card"><CardHeader><Wallet className="text-primary" /><CardTitle className="text-white">Wallet signing next</CardTitle><CardDescription className="text-slate-300">The sandbox returns a sign message for the next verification step.</CardDescription></CardHeader></Card>
      </section>
    </div>
  )
}
