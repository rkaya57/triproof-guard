import Link from "next/link"
import { FileText, LockKeyhole, ShieldAlert, TimerReset } from "lucide-react"

const legalLinks = [
  [LockKeyhole, "Privacy Policy", "/privacy"],
  [FileText, "Terms of Service", "/terms"],
  [ShieldAlert, "Risk Disclosure", "/risk-disclosure"],
  [TimerReset, "Data Retention", "/data-retention"],
] as const

export function HomeLegalLinks() {
  return (
    <div className="border-b border-cyan-400/10 bg-[#03091a]/95 text-slate-400">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 overflow-x-auto px-5 py-2 text-[11px] sm:px-8">
        <span className="hidden shrink-0 font-mono uppercase tracking-[0.18em] text-cyan-300/70 md:inline">Legal & Trust</span>
        <nav aria-label="Legal and trust links" className="flex min-w-max items-center gap-4 sm:gap-5">
          {legalLinks.map(([Icon, label, href]) => (
            <Link key={href} href={href} className="inline-flex items-center gap-1.5 whitespace-nowrap transition-colors hover:text-cyan-200">
              <Icon className="size-3.5 text-cyan-300/75" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
