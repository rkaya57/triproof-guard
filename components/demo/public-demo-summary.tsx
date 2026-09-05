import { publicDecisionLabels, type PublicDemoSnapshot } from "@/lib/demo/public-types"

export function PublicDemoSummary({ summary }: { summary: PublicDemoSnapshot["summary"] }) {
  const stats = [
    ["Total wallets", summary.totalWallets],
    [publicDecisionLabels.approved, summary.approved],
    [publicDecisionLabels.review, summary.review],
    [publicDecisionLabels.insufficient_data, summary.insufficient_data],
    [publicDecisionLabels.not_eligible, summary.not_eligible],
  ] as const
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">{stats.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-2 text-3xl font-semibold text-white">{value}</dd></div>)}</dl>
}
