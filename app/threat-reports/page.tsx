import { PublicTopNav } from "@/components/layout/public-top-nav"
import { ThreatReportHub } from "@/components/threat-reports/threat-report-hub"
import { getCurrentUser } from "@/lib/auth/session"
import { listPublishedCommunityThreatReports } from "@/lib/scamguard/community-reports"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Community Threat Reports | Tri-Proof Guard",
  description: "Reviewed community reports for scam projects, phishing infrastructure, wallet drainers, and malicious Web3 targets.",
}

export default async function ThreatReportsPage({ searchParams }: { searchParams: Promise<{ target?: string; kind?: string }> }) {
  const query = await searchParams
  const [user, reports] = await Promise.all([
    getCurrentUser(),
    listPublishedCommunityThreatReports().catch(() => []),
  ])
  return <main className="min-h-screen bg-background"><PublicTopNav /><div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14"><ThreatReportHub initialReports={reports.map((report) => ({ ...report, publishedAt: report.publishedAt?.toISOString() ?? null, createdAt: report.createdAt.toISOString() }))} isSignedIn={Boolean(user)} initialTarget={query.target?.slice(0, 500) ?? ""} initialTargetKind={query.kind === "DOMAIN" ? "DOMAIN" : undefined} /></div></main>
}
