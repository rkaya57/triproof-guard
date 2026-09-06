import Link from "next/link"
import { CheckCircle2, CircleDashed, Fingerprint, ShieldCheck, TriangleAlert, WalletCards, type LucideIcon } from "lucide-react"

import { AdminWorkspaceHeader } from "@/components/admin/admin-workspace-header"
import { HumanityV2AdminCameraSandbox } from "@/components/humanity/v2/admin-camera-sandbox"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"

function decisionClass(decision: string) {
  if (decision === "APPROVED") return "border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-200"
  if (decision === "REJECTED") return "border-rose-300/20 bg-rose-300/[0.04] text-rose-200"
  return "border-amber-300/20 bg-amber-300/[0.04] text-amber-200"
}

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) {
    return (
      <Card className="glass-panel mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Admin login required</CardTitle>
          <CardDescription>Log in with a Tri-Proof admin email to inspect Humanity V2.</CardDescription>
        </CardHeader>
        <CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent>
      </Card>
    )
  }

  const [campaigns, recentVerifications] = await Promise.all([
    db.humanityCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { sessions: true, verifications: true } } },
    }),
    db.humanityVerification.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { campaign: { select: { name: true, slug: true } } },
    }),
  ])

  const signedCount = recentVerifications.filter((item) => item.signatureVerified).length
  const reviewCount = recentVerifications.filter((item) => item.decision === "MANUAL_REVIEW").length
  const summaryCards: Array<{ icon: LucideIcon; label: string; value: number; detail: string }> = [
    { icon: Fingerprint, label: "Campaigns", value: campaigns.length, detail: "Configured Humanity campaigns" },
    { icon: CircleDashed, label: "Recent verifications", value: recentVerifications.length, detail: "Latest V2 verification records" },
    { icon: WalletCards, label: "Signed proofs", value: signedCount, detail: "Cryptographically verified wallet signatures" },
    { icon: TriangleAlert, label: "Review queue", value: reviewCount, detail: "Client-only telemetry awaiting stronger attestation" },
  ]
  const cameraCampaigns = campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    challengeLevel: campaign.challengeLevel,
    enabled: campaign.humanityGateEnabled,
  }))

  return (
    <div className="grid gap-6 pb-10">
      <AdminWorkspaceHeader
        icon={Fingerprint}
        eyebrow="Humanity V2"
        title="Proof-of-human recovery console"
        description="Server-bound challenge sessions, campaign-scoped nullifiers and canonical wallet signatures. Client camera telemetry is deliberately review-only until server-attested anti-spoof evidence is available."
        tone="amber"
        meta={
          <>
            <span className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.025] px-3 py-2 text-xs text-cyan-200"><ShieldCheck className="size-3.5" /> V2 trust boundary active</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-amber-300/12 bg-amber-300/[0.025] px-3 py-2 text-xs text-amber-200"><TriangleAlert className="size-3.5" /> Client telemetry cannot auto-approve</span>
          </>
        }
        actions={<Link href="/dashboard/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>Admin center</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ icon: Icon, label, value, detail }) => (
          <Card key={label} className="glass-panel premium-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-[0.13em] text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-white">{value}</p></div>
                <span className="rounded-xl border border-white/10 bg-white/[0.04] p-2"><Icon className="size-5 text-cyan-300" /></span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <HumanityV2AdminCameraSandbox campaigns={cameraCampaigns} />

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>Challenge policy and proof lifetime. Campaign creation is available through the admin V2 API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-slate-400">No Humanity V2 campaigns exist yet. Create the first one through <code>POST /api/humanity/v2/admin/campaigns</code>.</div>
            ) : campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-medium text-white">{campaign.name}</p><p className="mt-1 text-xs text-slate-500">{campaign.slug}</p></div>
                  <Badge variant="outline" className={campaign.humanityGateEnabled ? "border-emerald-300/20 text-emerald-200" : "border-slate-300/20 text-slate-300"}>{campaign.humanityGateEnabled ? "Enabled" : "Disabled"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4">
                  <span>Level <strong className="text-slate-200">{campaign.challengeLevel}</strong></span>
                  <span>Attempts <strong className="text-slate-200">{campaign.maxAttemptsPerWallet}</strong></span>
                  <span>Sessions <strong className="text-slate-200">{campaign._count.sessions}</strong></span>
                  <span>Proofs <strong className="text-slate-200">{campaign._count.verifications}</strong></span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel border-amber-300/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-amber-300" /> Current security boundary</CardTitle>
            <CardDescription>What this recovery phase does and does not claim.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
            <p><CheckCircle2 className="mr-2 inline size-4 text-emerald-300" />Challenge nonce, sequence, expiry and attempt policy are issued by the server.</p>
            <p><CheckCircle2 className="mr-2 inline size-4 text-emerald-300" />Camera sandbox follows the issued sequence exactly and does not upload raw video.</p>
            <p><CheckCircle2 className="mr-2 inline size-4 text-emerald-300" />Nullifiers are stable per campaign + wallet and do not change with a new session nonce.</p>
            <p><CheckCircle2 className="mr-2 inline size-4 text-emerald-300" />EVM and Solana signatures bind to a canonical message rebuilt from stored proof state.</p>
            <p><TriangleAlert className="mr-2 inline size-4 text-amber-300" />Browser face/hand scores remain untrusted telemetry and cannot issue an automatic APPROVED result.</p>
          </CardContent>
        </Card>
      </section>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent verifications</CardTitle>
          <CardDescription>Newest persisted Humanity records, including wallet-signature state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentVerifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-slate-400">No V2 verification has been submitted yet.</div>
          ) : recentVerifications.map((verification) => (
            <div key={verification.id} className="grid gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-white">{verification.campaign.name}</p><Badge variant="outline" className={decisionClass(verification.decision)}>{verification.decision}</Badge>{verification.signatureVerified ? <Badge variant="outline" className="border-cyan-300/20 text-cyan-200">Signed</Badge> : null}</div>
                <p className="mt-2 break-all font-mono text-xs text-slate-500">{verification.walletAddress}</p>
              </div>
              <div className="text-left md:text-right"><p className="text-sm font-medium text-slate-200">Score {Math.round(verification.humanSessionScore)}</p><p className="mt-1 text-xs text-slate-500">{verification.createdAt.toISOString()}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
