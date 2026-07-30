import Link from "next/link"
import { Archive, BookOpenCheck, Braces, FileText, Scale, ShieldAlert } from "lucide-react"

import { LegalPageLayout } from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Trust and Legal Center | Tri-Proof Guard",
  description: "Privacy, service terms, risk disclosures, data retention practices, and API terms for Tri-Proof Guard.",
}

const documents = [
  ["Privacy Policy", "What information Tri-Proof Guard processes, why it is used, and how to contact us about your data.", "/privacy", FileText],
  ["Terms of Service", "The agreement for using Tri-Proof Guard, paid access, accounts, and product limits.", "/terms", Scale],
  ["Risk Disclosure", "Why risk scores and AI explanations are decision support, not a guarantee or financial advice.", "/risk-disclosure", ShieldAlert],
  ["Data Retention", "The current lifecycle approach for accounts, analysis records, operational logs, and deletion requests.", "/data-retention", Archive],
  ["API Terms", "Rules for teams using ScamGuard and Sybil analysis through a programmatic integration.", "/api-terms", Braces],
] as const

export default function LegalOverviewPage() {
  return (
    <LegalPageLayout eyebrow="Trust and legal" title="Clear rules for a safety-critical product." summary="These documents explain how Tri-Proof Guard operates today. They are written for users, partners, and B2B evaluators, and should be read alongside the product methodology.">
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-5">
        <div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><h2 className="mt-0">A plain-language trust center</h2><p className="mb-0">Tri-Proof Guard helps people inspect Web3 risk signals. It never asks for seed phrases or private keys, does not custody assets, and cannot guarantee that any link, wallet, token, contract, or transaction is safe.</p></div></div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {documents.map(([title, detail, href, Icon]) => <Link key={href} href={href} className="group rounded-lg border border-border bg-card/55 p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"><Icon className="size-5 text-primary" /><h2 className="mb-2 mt-4 text-xl group-hover:text-primary">{title}</h2><p className="mb-0 text-sm">{detail}</p></Link>)}
      </div>
    </LegalPageLayout>
  )
}
