"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  FileText,
  FilePlus2,
  HeartPulse,
  Home,
  LogOut,
  ScanFace,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/new-analysis", label: "New Analysis", icon: FilePlus2 },
  { href: "/dashboard/demo", label: "Demo Report", icon: BarChart3 },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/pricing", label: "Pricing", icon: Tags },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

const adminNavItems = [
  { href: "/dashboard/admin", label: "Admin Center", icon: ShieldCheck },
  { href: "/dashboard/admin/humanity", label: "Humanity Gate", icon: ScanFace },
  { href: "/dashboard/admin/diagnostics", label: "Diagnostics", icon: HeartPulse },
]

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
          <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
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
                    "hover-lift justify-start transition-all",
                    active && "nav-glow-active border-primary/30 bg-primary/10 text-primary",
                    item.href.startsWith("/dashboard/admin") &&
                      "border-yellow-400/20 text-yellow-100 hover:bg-yellow-400/10 hover:text-yellow-100"
                  )}
                >
                  <item.icon data-icon="inline-start" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="glass-panel premium-card hidden rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground lg:block">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Sparkles className="text-primary" />
              Guard MVP
            </div>
            <p>Wallet risk analysis, clustering, manual review and exports.</p>
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
              Web3 Campaign Wallet Risk Analysis
            </span>
            <h1 className="text-gradient animate-gradient-text text-2xl font-semibold">Dashboard</h1>
          </div>
        </header>
        <main className="px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
