import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Database,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  ScanFace,
  ShieldCheck,
  Wallet,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

const productFlow = [
  [Wallet, "Connect Wallet", "User connects or enters an EVM/Solana wallet before joining a campaign."],
  [Camera, "Verify Humanity", "Short live challenge checks human presence with derived scores only."],
  [Fingerprint, "Sign Message", "Wallet ownership is proven with a signed message after the challenge."],
  [BadgeCheck, "Join Campaign", "Approved/manual users can continue; Guard can analyze wallet risk later."],
]

const mergeChecklist = [
  "Add Humanity* Prisma models as additive tables in the main Guard schema.",
  "Move /api/humanity/* routes behind existing admin/session protections.",
  "Import HumanityChallenge and wallet signing components after dependency review.",
  "Add HUMANITY_NULLIFIER_SECRET and optional Guard webhook env vars.",
  "Seed demo campaigns only for admin/test environments.",
  "Keep public /humanity/demo hidden until production safety review is complete.",
]

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">
          Humanity Gate Lab is only visible to approved Tri-Proof admin email accounts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>
      </CardContent>
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
              <Badge variant="secondary" className="border-purple-400/30 bg-purple-400/10 text-purple-100">Admin-only test module</Badge>
              <Badge variant="outline" className="border-yellow-400/30 bg-yellow-400/10 text-yellow-200">Testing stage</Badge>
            </div>
            <h1 className="text-gradient text-4xl font-semibold sm:text-6xl">Tri-Proof Humanity Gate</h1>
            <p className="mt-5 max-w-3xl leading-7 text-slate-300">
              Privacy-first human presence verification for campaign registration. This module stays inside the admin panel until the live API, database models, camera flow and wallet signature path pass production review.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://github.com/rkaya57/triproof-humanity-codex"
                target="_blank"
                rel="noreferrer"
                className={`${buttonVariants()} glow-primary hover-lift`}
              >
                Open source repo <ArrowRight data-icon="inline-end" />
              </a>
              <Link href="/dashboard/admin" className={`${buttonVariants({ variant: "outline" })} text-white`}>Back to Admin Center</Link>
            </div>
          </div>
          <Card className="glass-panel premium-card animated-border border-purple-400/20 bg-purple-400/5">
            <CardHeader>
              <ScanFace className="text-purple-300" />
              <CardTitle className="text-white">Integration status</CardTitle>
              <CardDescription className="text-slate-300">Safe shell added. Full live merge is intentionally gated.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-xl border border-green-400/20 bg-green-400/10 p-3">
                <span>Admin route</span><span className="text-green-300">Ready</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-green-400/20 bg-green-400/10 p-3">
                <span>Menu visibility</span><span className="text-green-300">Admin-only</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                <span>Live camera/API merge</span><span className="text-yellow-300">Pending</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {productFlow.map(([Icon, title, text], index) => (
          <Card key={title as string} className="glass-panel premium-card hover-lift animated-border">
            <CardHeader>
              <div className="mb-2 flex items-center justify-between">
                <Icon className="text-primary" />
                <span className="font-mono text-xs text-primary/70">0{index + 1}</span>
              </div>
              <CardTitle className="text-white">{title as string}</CardTitle>
              <CardDescription className="text-slate-300">{text as string}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" /> Product boundary</CardTitle>
            <CardDescription className="text-slate-300">Humanity Gate is not KYC and does not replace Guard wallet risk scoring.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
            <p>
              Humanity Gate verifies live human presence at campaign registration. It stores derived scores, reason codes, timestamps, wallet address and campaign metadata — not raw video.
            </p>
            <p>
              Guard still handles Sybil detection, wallet clustering, funding-source risk, entity labels and reward eligibility after registration.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><GitBranch className="text-primary" /> Safe merge checklist</CardTitle>
            <CardDescription className="text-slate-300">Next steps before making the Humanity demo live inside the main app.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {mergeChecklist.map((item) => (
              <div key={item} className="flex gap-3 rounded-xl border border-border bg-background/45 p-3 text-sm text-slate-300">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <Database className="text-primary" />
            <CardTitle className="text-white">Data models to merge later</CardTitle>
            <CardDescription className="text-slate-300">HumanityCampaign, HumanityChallengeSession and HumanityVerification.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader>
            <Camera className="text-primary" />
            <CardTitle className="text-white">Camera flow held back</CardTitle>
            <CardDescription className="text-slate-300">Live browser challenge remains disabled on the public product until admin testing is approved.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="glass-panel premium-card">
          <CardHeader>
            <Wallet className="text-primary" />
            <CardTitle className="text-white">Wallet signing path</CardTitle>
            <CardDescription className="text-slate-300">EVM/Solana signature verification should be tested before external campaign use.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  )
}
