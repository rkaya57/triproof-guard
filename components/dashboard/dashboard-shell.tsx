"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  FileText,
  FilePlus2,
  Home,
  LogOut,
  Settings,
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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-border bg-sidebar/95 lg:sticky lg:top-0 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:flex-col lg:items-stretch lg:gap-8 lg:px-4">
          <Link href="/" className="flex items-center gap-3 px-1">
            <Image
              src="/logo.svg"
              alt="Tri-Proof Guard"
              width={36}
              height={36}
              priority
              className="rounded-lg"
            />
            <div className="hidden flex-col lg:flex">
              <span className="text-sm font-semibold">Tri-Proof Guard</span>
              <span className="text-xs text-muted-foreground">Risk console</span>
            </div>
          </Link>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost" }),
                    "justify-start",
                    active && "border-primary/30 bg-primary/10 text-primary"
                  )}
                >
                  <item.icon data-icon="inline-start" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="hidden rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground lg:block">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Sparkles />
              Guard MVP
            </div>
            Wallet risk analysis, clustering, manual review and exports.
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOut data-icon="inline-start" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="scan-accent border-b border-border bg-background/80 px-5 py-4 backdrop-blur sm:px-8">
          <div className="flex flex-col gap-2">
            <span className="cyber-chip w-fit">
              Web3 Campaign Wallet Risk Analysis
            </span>
            <h1 className="text-gradient text-2xl font-semibold">Dashboard</h1>
          </div>
        </header>
        <main className="px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
