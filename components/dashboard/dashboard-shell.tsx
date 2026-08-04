"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  ChevronDown,
  FileText,
  FilePlus2,
  Code2,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  LogOut,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/new-analysis", label: "New Analysis", icon: FilePlus2 },
  { href: "/scamguard", label: "ScamGuard", icon: ShieldAlert },
  { href: "/dashboard/demo", label: "Demo Report", icon: BarChart3 },
  { href: "/dashboard/airdrop", label: "Airdrop Tasks", icon: Gift },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/threat-reports", label: "Threat Pool", icon: ShieldAlert },
  { href: "/dashboard/developer", label: "Developer", icon: Code2 },
  { href: "/dashboard/policies", label: "Team Policies", icon: ShieldCheck },
  { href: "/dashboard/net", label: "Tri Proof Net", icon: Landmark },
  { href: "/pricing", label: "Pricing", icon: Tags },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

const adminNavItems = [
  { href: "/dashboard/admin", label: "Admin Center", icon: ShieldCheck },
  { href: "/dashboard/admin/scamguard", label: "Threat Review", icon: ShieldAlert },
  { href: "/dashboard/admin/airdrop", label: "Airdrop Review", icon: Gift },
  { href: "/dashboard/admin/diagnostics", label: "Diagnostics", icon: HeartPulse },
  { href: "/dashboard/admin/payments", label: "Payments", icon: Tags },
]

const routeTitles = [
  { href: "/dashboard/admin/airdrop", title: "Airdrop Review", eyebrow: "Season 0 task moderation" },
  { href: "/dashboard/admin/scamguard", title: "Threat Review", eyebrow: "ScamGuard community moderation" },
  { href: "/dashboard/admin/diagnostics", title: "Diagnostics", eyebrow: "Production hardening checks" },
  { href: "/dashboard/admin/payments", title: "Payments", eyebrow: "Solana checkout operations" },
  { href: "/dashboard/admin/analyses", title: "Analysis Admin", eyebrow: "Campaign operations" },
  { href: "/dashboard/admin/blog", title: "Blog Admin", eyebrow: "Content operations" },
  { href: "/dashboard/admin/bugs", title: "Issue Console", eyebrow: "Product feedback queue" },
  { href: "/dashboard/admin", title: "Admin Center", eyebrow: "Operations command center" },
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
  const items = isAdmin ? [...navItems, ...adminNavItems] : navItems
  const routeTitle = getRouteTitle(pathname)

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  return (
    <div className="premium-page min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="premium-sidebar border-b border-border bg-sidebar/95 backdrop-blur-xl lg:sticky lg:top-0 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="relative z-10 flex items-center justify-between px-5 py-4 lg:flex-col lg:items-stretch lg:gap-8 lg:px-4">
          <Link href="/" className="group flex items-center gap-3 px-1">
            <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
              <Image
                src="/logo.svg"
                alt="Tri-Proof Guard"
                width={32}
                height={32}
                priority
                className="rounded-lg"
              />
            </span>
            <div className="hidden flex-col lg:flex">
              <span className="text-sm font-semibold">Tri-Proof Guard</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/75">
                Risk console
              </span>
            </div>
          </Link>
          <nav className="flex max-w-[calc(100vw-8rem)] gap-2 overflow-x-auto pb-1 lg:max-w-none lg:flex-col lg:overflow-visible lg:pb-0">
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost" }),
                    "hover-lift min-w-[4.6rem] flex-col gap-1 px-2 py-2 text-[10px] leading-tight transition-all sm:min-w-0 sm:flex-row sm:justify-start sm:text-sm lg:w-full",
                    active && "nav-glow-active border-primary/30 bg-primary/10 text-primary",
                    item.href.startsWith("/dashboard/admin") &&
                      "border-yellow-400/20 text-yellow-100 hover:bg-yellow-400/10 hover:text-yellow-100"
                  )}
                  title={item.label}
                >
                  <item.icon data-icon="inline-start" />
                  <span className="max-w-[4.25rem] truncate sm:max-w-none">{item.label}</span>
                </Link>
              )
            })}
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
          <Button variant="outline" onClick={logout} className="hover-lift">
            <LogOut data-icon="inline-start" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
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
