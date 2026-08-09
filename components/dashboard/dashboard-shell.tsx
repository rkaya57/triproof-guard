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
  { href: "/dashboard", title: "Overview", eyebrow: "Web3 Campaign Wallet Risk Analysis" },
]

function getRouteTitle(pathname: string) {
  return (
    routeTitles.find((route) => pathname === route.href || (route.href !== "/dashboard" && pathname.startsWith(route.href))) ??
    routeTitles[routeTitles.length - 1]
  )
}

export function DashboardShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode
  isAdmin?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const routeTitle = getRouteTitle(pathname)

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  function navLinkClass(href: string, admin = false) {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

    return cn(
      buttonVariants({ variant: active ? "secondary" : "ghost" }),
      "hover-lift h-auto min-w-0 flex-col items-start gap-2 whitespace-normal px-3 py-3 text-left text-xs leading-tight transition-all sm:text-sm lg:w-full lg:flex-row lg:items-center lg:justify-start lg:gap-2 lg:whitespace-nowrap lg:py-2",
      active && "nav-glow-active border-primary/30 bg-primary/10 text-primary",
      admin && "border-yellow-400/20 text-yellow-100 hover:bg-yellow-400/10 hover:text-yellow-100"
    )
  }

  return (
    <div className="premium-page min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="premium-sidebar sticky top-0 z-40 border-b border-border bg-sidebar/95 backdrop-blur-xl lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="relative z-10 px-4 py-3 sm:px-5 lg:flex lg:min-h-screen lg:flex-col lg:gap-6 lg:px-4 lg:py-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="group flex min-w-0 items-center gap-3 px-1">
              <span className="glow-primary flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
                <Image
                  src="/logo.svg"
                  alt="Tri-Proof Guard"
                  width={32}
                  height={32}
                  priority
                  className="rounded-lg"
                />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">Tri-Proof Guard</span>
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-primary/75">
                  Risk console
                </span>
              </div>
            </Link>

            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="shrink-0 lg:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="dashboard-mobile-navigation"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X aria-hidden /> : <Menu aria-hidden />}
              <span className="sr-only">Toggle dashboard navigation</span>
            </Button>
          </div>

          <div
            id="dashboard-mobile-navigation"
            className={cn(
              "mt-3 gap-4 lg:mt-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
              mobileNavOpen ? "grid" : "hidden lg:flex"
            )}
          >
            <nav className="grid max-h-[min(66vh,38rem)] gap-3 overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:gap-4 lg:overflow-visible lg:pr-0">
              {navGroups.map((group) => (
                <div key={group.label} className="grid gap-2">
                  <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={navLinkClass(item.href)}
                        title={item.label}
                      >
                        <item.icon data-icon="inline-start" className="size-4" />
                        <span className="break-words lg:truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {isAdmin && (
                <div className="grid gap-2 border-t border-yellow-400/15 pt-3">
                  <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-yellow-200/70">
                    Administration
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {adminNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={navLinkClass(item.href, true)}
                        title={item.label}
                      >
                        <item.icon data-icon="inline-start" className="size-4" />
                        <span className="break-words lg:truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </nav>

            <div className="glass-panel premium-card hidden rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground lg:block">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <Sparkles className="text-primary" />
                Guard Product
              </div>
              <p>Wallet risk analysis, clustering, Gray Zone review and exports.</p>
              <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary/80">
                <span className="pulse-dot" /> Batch queue ready
              </div>
            </div>

            <Button variant="outline" onClick={logout} className="hover-lift w-full justify-center lg:mt-auto">
              <LogOut data-icon="inline-start" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="scan-accent border-b border-border bg-background/80 px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-col gap-2 reveal-up">
            <span className="cyber-chip w-fit">
              {routeTitle.eyebrow}
            </span>
            <div className="flex items-center gap-2">
              <h1 className="text-gradient animate-gradient-text text-2xl font-semibold">{routeTitle.title}</h1>
              <ChevronDown className="size-4 text-primary/60 lg:hidden" aria-hidden />
            </div>
          </div>
        </header>
        <main className="px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
