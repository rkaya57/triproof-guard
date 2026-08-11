"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  ChevronDown,
  Code2,
  FilePlus2,
  FileText,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  Layers3,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
  UsersRound,
  X,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: Home },
      { href: "/dashboard/airdrop", label: "Airdrop Tasks", icon: Gift },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/dashboard/campaigns", label: "Campaigns", icon: Layers3 },
      { href: "/dashboard/new-analysis", label: "New Analysis", icon: FilePlus2 },
      { href: "/dashboard/reports", label: "Reports", icon: FileText },
      { href: "/dashboard/demo", label: "Demo Report", icon: BarChart3 },
    ],
  },
  {
    label: "Protection",
    items: [
      { href: "/scamguard", label: "ScamGuard", icon: ShieldAlert },
      { href: "/threat-reports", label: "Threat Pool", icon: ShieldAlert },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/dashboard/developer", label: "Developer", icon: Code2 },
      { href: "/dashboard/policies", label: "Team Policies", icon: ShieldCheck },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/pricing", label: "Pricing", icon: Tags },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
] as const

const adminNavItems = [
  { href: "/dashboard/admin", label: "Admin Center", icon: ShieldCheck },
  { href: "/dashboard/admin/scamguard", label: "Threat Review", icon: ShieldAlert },
  { href: "/dashboard/admin/airdrop", label: "Airdrop Review", icon: Gift },
  { href: "/dashboard/admin/diagnostics", label: "Diagnostics", icon: HeartPulse },
  { href: "/dashboard/admin/payments", label: "Payments", icon: Tags },
  { href: "/dashboard/admin/users", label: "Users", icon: UsersRound },
  { href: "/dashboard/net", label: "Tri Proof Net", icon: Landmark },
] as const

const routeTitles = [
  { href: "/dashboard/admin/airdrop", title: "Airdrop Review", eyebrow: "Season 0 task moderation" },
  { href: "/dashboard/admin/scamguard", title: "Threat Review", eyebrow: "ScamGuard community moderation" },
  { href: "/dashboard/admin/diagnostics", title: "Diagnostics", eyebrow: "Production hardening checks" },
  { href: "/dashboard/admin/payments", title: "Payments", eyebrow: "Solana checkout operations" },
  { href: "/dashboard/admin/users", title: "Users", eyebrow: "Admin-only account directory" },
  { href: "/dashboard/admin/analyses", title: "Analysis Admin", eyebrow: "Campaign operations" },
  { href: "/dashboard/admin/blog", title: "Blog Admin", eyebrow: "Content operations" },
  { href: "/dashboard/admin/bugs", title: "Issue Console", eyebrow: "Product feedback queue" },
  { href: "/dashboard/admin", title: "Admin Center", eyebrow: "Operations command center" },
  { href: "/dashboard/campaigns", title: "Campaigns", eyebrow: "Campaign security operations" },
  { href: "/dashboard/new-analysis", title: "New Analysis", eyebrow: "Upload and score wallet lists" },
  { href: "/dashboard/demo", title: "Demo Report", eyebrow: "Sample campaign intelligence" },
  { href: "/dashboard/airdrop", title: "Airdrop Tasks", eyebrow: "Community contribution season" },
  { href: "/dashboard/reports", title: "Reports", eyebrow: "Saved exports and analysis history" },
  { href: "/threat-reports", title: "Threat Pool", eyebrow: "Community-reviewed scam intelligence" },
  { href: "/dashboard/developer", title: "Developer", eyebrow: "API keys and Group Guardian access" },
  { href: "/dashboard/policies", title: "Team Policies", eyebrow: "B2B and Guardian safety controls" },
  { href: "/dashboard/net", title: "Tri Proof Net", eyebrow: "Internal document office and approval workflow" },
  { href: "/dashboard/settings", title: "Settings", eyebrow: "Workspace preferences" },
  { href: "/dashboard/analysis", title: "Analysis Report", eyebrow: "Risk decision center" },
  { href: "/dashboard", title: "Overview", eyebrow: "Web3 campaign security workspace" },
]

function getRouteTitle(pathname: string) {
  return routeTitles.find((route) => pathname === route.href || (route.href !== "/dashboard" && pathname.startsWith(route.href))) ?? routeTitles[routeTitles.length - 1]
}

function routeSection(pathname: string) {
  if (pathname.startsWith("/dashboard/admin") || pathname.startsWith("/dashboard/net")) return "Administration"
  if (pathname.startsWith("/dashboard/analysis") || pathname.startsWith("/dashboard/campaigns") || pathname.startsWith("/dashboard/reports") || pathname.startsWith("/dashboard/new-analysis")) return "Analysis"
  if (pathname.startsWith("/dashboard/developer") || pathname.startsWith("/dashboard/policies")) return "Integrations"
  if (pathname.startsWith("/dashboard/settings")) return "Account"
  return "Workspace"
}

export function DashboardShell({ children, isAdmin = false }: { children: React.ReactNode; isAdmin?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const routeTitle = getRouteTitle(pathname)
  const section = routeSection(pathname)

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  function navLinkClass(href: string, admin = false) {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
    return cn(
      buttonVariants({ variant: "ghost" }),
      "group h-auto min-w-0 justify-start gap-3 whitespace-normal rounded-xl border border-transparent px-3 py-2.5 text-left text-xs leading-tight transition-all sm:text-sm lg:w-full lg:whitespace-nowrap",
      "text-slate-400 hover:border-cyan-400/15 hover:bg-cyan-400/[0.04] hover:text-slate-100",
      active && "border-cyan-400/25 bg-[linear-gradient(90deg,rgba(34,211,238,.11),rgba(59,130,246,.05),transparent)] text-cyan-100 shadow-[inset_3px_0_0_rgba(34,211,238,.75)]",
      admin && !active && "text-amber-100/70 hover:border-amber-400/15 hover:bg-amber-400/[0.04] hover:text-amber-100",
      admin && active && "border-amber-400/25 bg-amber-400/[0.06] text-amber-100 shadow-[inset_3px_0_0_rgba(251,191,36,.75)]"
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050914] text-foreground lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_18%_8%,rgba(6,182,212,.08),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(124,58,237,.08),transparent_30%),linear-gradient(rgba(30,41,59,.10)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,.10)_1px,transparent_1px)] bg-[size:auto,auto,48px_48px,48px_48px]" />

      <aside className="relative z-40 border-b border-white/[0.06] bg-[#07101f]/95 backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-4 py-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
            <Link href="/" className="group flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] shadow-[0_0_30px_rgba(34,211,238,.08)]">
                <Image src="/logo.svg" alt="Tri-Proof Protocol" width={29} height={29} priority className="rounded-lg" />
              </span>
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-white">Tri-Proof Protocol</span>
                <span className="block truncate font-mono text-[9px] uppercase tracking-[0.22em] text-cyan-300/60">Security Console</span>
              </div>
            </Link>
            <Button type="button" variant="outline" size="icon-lg" className="shrink-0 border-white/10 bg-white/[0.02] lg:hidden" aria-expanded={mobileNavOpen} aria-controls="dashboard-mobile-navigation" onClick={() => setMobileNavOpen((open) => !open)}>
              {mobileNavOpen ? <X aria-hidden /> : <Menu aria-hidden />}
              <span className="sr-only">Toggle dashboard navigation</span>
            </Button>
          </div>

          <div id="dashboard-mobile-navigation" className={cn("mt-4 gap-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col", mobileNavOpen ? "grid" : "hidden lg:flex")}>
            <nav className="grid max-h-[min(68vh,42rem)] gap-4 overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:flex-1 lg:overflow-y-auto">
              {navGroups.map((group) => (
                <div key={group.label} className="grid gap-1.5">
                  <p className="px-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">{group.label}</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                    {group.items.map((item) => (
                      <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={navLinkClass(item.href)} title={item.label}>
                        <item.icon className="size-4 shrink-0 text-current opacity-80 transition-transform group-hover:scale-105" />
                        <span className="break-words lg:truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {isAdmin && (
                <div className="grid gap-1.5 border-t border-amber-400/10 pt-4">
                  <p className="px-2 font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300/45">Administration</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                    {adminNavItems.map((item) => (
                      <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={navLinkClass(item.href, true)} title={item.label}>
                        <item.icon className="size-4 shrink-0 opacity-80" />
                        <span className="break-words lg:truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </nav>

            <div className="hidden rounded-2xl border border-cyan-400/10 bg-[linear-gradient(135deg,rgba(8,47,73,.24),rgba(15,23,42,.5))] p-4 lg:block">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Sparkles className="size-4 text-cyan-300" /> Security workspace</div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Sybil intelligence, pre-sign protection and explainable evidence in one console.</p>
              <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300/70"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,.8)]" /> Production online</div>
            </div>

            <Button variant="outline" onClick={logout} className="w-full justify-center border-white/10 bg-white/[0.02] text-slate-300 hover:bg-rose-400/[0.05] hover:text-rose-200 lg:mt-1">
              <LogOut className="size-4" /> Logout
            </Button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 min-w-0">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#050914]/80 px-5 py-3.5 backdrop-blur-2xl sm:px-7 xl:px-9">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                <span>{section}</span><span className="text-cyan-400/50">/</span><span className="truncate text-cyan-300/70">{routeTitle.eyebrow}</span>
              </div>
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">{routeTitle.title}</h1>
                <ChevronDown className="size-4 shrink-0 text-cyan-300/40 lg:hidden" aria-hidden />
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/80">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" /> Live production
              </div>
              <Link href="/dashboard/new-analysis" className={cn(buttonVariants({ size: "sm" }), "border border-cyan-300/20 bg-cyan-400/90 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.12)] hover:bg-cyan-300")}>New analysis</Link>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-7 sm:py-7 xl:px-9">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
