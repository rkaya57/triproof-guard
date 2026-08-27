import Link from "next/link"
import {
  BookOpenCheck,
  Boxes,
  Code2,
  ExternalLink,
  FileCheck2,
  Network,
  ScanSearch,
  ShieldCheck,
  Webhook,
} from "lucide-react"

import { cn } from "@/lib/utils"

type TocItem = {
  id: string
  label: string
}

type ProductDocsShellProps = {
  currentPath: string
  toc?: TocItem[]
  children: React.ReactNode
}

type NavItem = {
  href: string
  label: string
  icon: typeof BookOpenCheck
  description?: string
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "Get started",
    items: [
      {
        href: "/docs",
        label: "Documentation home",
        icon: BookOpenCheck,
      },
      {
        href: "/docs/campaign-analysis",
        label: "Campaign analysis",
        icon: FileCheck2,
      },
    ],
  },
  {
    label: "Investigate",
    items: [
      {
        href: "/docs/investigations",
        label: "Wallet & cluster investigations",
        icon: Network,
      },
    ],
  },
  {
    label: "Protect",
    items: [
      {
        href: "/docs/scamguard",
        label: "ScamGuard",
        icon: ShieldCheck,
      },
      {
        href: "/extension",
        label: "Browser extension",
        icon: ScanSearch,
      },
      {
        href: "/telegram",
        label: "Telegram protection",
        icon: Boxes,
      },
    ],
  },
  {
    label: "Integrate",
    items: [
      {
        href: "/docs/integrations",
        label: "Integration guide",
        icon: Code2,
      },
      {
        href: "/docs/api/v2",
        label: "Campaign API v2",
        icon: Code2,
      },
      {
        href: "/docs/api/v2/sdk",
        label: "TypeScript SDK",
        icon: Boxes,
      },
      {
        href: "/docs/webhooks",
        label: "Webhooks",
        icon: Webhook,
      },
    ],
  },
  {
    label: "Operate safely",
    items: [
      {
        href: "/docs/trust",
        label: "Trust & evidence boundaries",
        icon: ShieldCheck,
      },
      {
        href: "/docs/production",
        label: "Production guide",
        icon: Boxes,
      },
      {
        href: "/docs/api/v2/openapi",
        label: "OpenAPI contract",
        icon: Code2,
      },
    ],
  },
]

function isActivePath(currentPath: string, href: string) {
  if (href === "/docs") return currentPath === href
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export function ProductDocsShell({ currentPath, toc = [], children }: ProductDocsShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/docs" className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">Tri-Proof Documentation</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">Sybil intelligence · investigations · integrations</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5 text-sm">
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:inline-flex"
            >
              Website
            </Link>
            <Link
              href="/docs/api/v2"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground md:inline-flex"
            >
              API reference
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 font-medium text-primary transition-colors hover:bg-primary/15"
            >
              Dashboard
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="border-b border-border/60 bg-muted/15 lg:hidden">
        <div className="mx-auto flex max-w-[1560px] gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {navGroups.flatMap((group) => group.items).map((item) => {
            const active = isActivePath(currentPath, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1560px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,900px)_220px]">
        <aside className="hidden border-r border-border/60 lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-5 py-8">
            <nav aria-label="Documentation navigation" className="space-y-7">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = isActivePath(currentPath, item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted/55 hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 px-5 py-10 sm:px-8 lg:px-10 lg:py-12 xl:px-12">
          {children}
        </main>

        {toc.length > 0 ? (
          <aside className="hidden border-l border-border/60 xl:block">
            <div className="sticky top-16 px-6 py-10">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                On this page
              </p>
              <nav aria-label="On this page" className="space-y-1">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block border-l border-border px-3 py-1.5 text-xs leading-5 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

export function DocsEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 inline-flex items-center rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
      {children}
    </div>
  )
}

export function DocsPageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <header className="mb-12 border-b border-border/70 pb-9">
      {eyebrow ? <DocsEyebrow>{eyebrow}</DocsEyebrow> : null}
      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
      {children ? <div className="mt-6 flex flex-wrap gap-3">{children}</div> : null}
    </header>
  )
}

export function DocsCallout({
  title,
  children,
  tone = "info",
}: {
  title: string
  children: React.ReactNode
  tone?: "info" | "warning" | "success"
}) {
  const toneClasses = {
    info: "border-primary/25 bg-primary/[0.06]",
    warning: "border-amber-400/30 bg-amber-400/[0.06]",
    success: "border-emerald-400/30 bg-emerald-400/[0.06]",
  }

  return (
    <div className={cn("rounded-xl border p-4 sm:p-5", toneClasses[tone])}>
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1.5 text-sm leading-6 text-muted-foreground">{children}</div>
    </div>
  )
}

export function DocsNextLinks({
  items,
}: {
  items: Array<{ href: string; label: string; description: string }>
}) {
  return (
    <div className="mt-14 border-t border-border/70 pt-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Continue reading</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-border/75 bg-card/30 p-4 transition-colors hover:border-primary/35 hover:bg-primary/[0.04]"
          >
            <div className="text-sm font-semibold transition-colors group-hover:text-primary">{item.label}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
