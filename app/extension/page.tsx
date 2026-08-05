import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Puzzle,
  ScanSearch,
  ShieldCheck,
} from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = {
  title: "ScamGuard Browser Extension | Tri-Proof Protocol",
  description:
    "Review risky Web3 pages and connect the ScamGuard browser extension to your Tri-Proof account.",
}

const capabilities = [
  {
    icon: ScanSearch,
    title: "Page and destination context",
    text: "Use the active page, destination domain, and available client signals to prepare a ScamGuard risk review.",
  },
  {
    icon: ShieldCheck,
    title: "Explainable warnings",
    text: "Show the risk level, supporting signals, and recommended action instead of relying on an unexplained block screen.",
  },
  {
    icon: KeyRound,
    title: "Account-linked access",
    text: "Connect through a short-lived request flow. Tri-Proof never asks the extension for a seed phrase or private key.",
  },
] as const

export default function ExtensionPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">
            <Puzzle className="size-3.5" /> Browser protection surface
          </Badge>
          <h1 className="text-gradient max-w-5xl text-4xl font-semibold sm:text-6xl">
            Bring ScamGuard risk context into the browser.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            The ScamGuard browser extension is an access channel for the Tri-Proof security platform. It helps users review suspicious Web3 pages and signing context without taking custody of wallets or assets.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/contact?topic=extension-beta" className={buttonVariants()}>
              Request extension access <ArrowRight data-icon="inline-end" />
            </Link>
            <Link href="/scamguard" className={buttonVariants({ variant: "outline" })}>
              Sign in to use Web Scanner
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-9 max-w-3xl">
          <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">
            Current product scope
          </Badge>
          <h2 className="text-3xl font-semibold sm:text-5xl">One ScamGuard engine, multiple access channels.</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            The extension complements the web scanner and Telegram bot. It is not presented as a separate risk engine or custody product.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {capabilities.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.title} className="glass-panel premium-card">
                <CardHeader>
                  <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                    <Icon />
                  </span>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription className="leading-6">{item.text}</CardDescription>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="border-y border-border bg-primary/[0.03]">
        <div className="mx-auto grid max-w-7xl gap-7 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">
              Secure connection flow
            </Badge>
            <h2 className="text-3xl font-semibold sm:text-4xl">The extension starts the connection. Your account confirms it.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              A valid extension request opens the protected connection page with a request identifier. After sign-in, the user confirms the account link. Opening the connection route without a valid request does not grant extension access.
            </p>
          </div>
          <Card className="glass-panel premium-card border-primary/35 bg-primary/5">
            <CardContent className="grid gap-4 p-6">
              {[
                "Start from the installed ScamGuard extension.",
                "Review the Tri-Proof domain before signing in.",
                "Confirm only the account connection request you initiated.",
                "Never enter a seed phrase, private key, or wallet password.",
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-6 text-muted-foreground">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="glass-panel premium-card">
            <CardHeader>
              <CheckCircle2 className="size-6 text-primary" />
              <CardTitle>What the extension may use</CardTitle>
              <CardDescription className="leading-7">
                The active page URL, supported transaction context, user-triggered scan inputs, and the minimum account token needed for authenticated ScamGuard access.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-yellow-400/25 bg-yellow-400/5">
            <CardHeader>
              <CircleAlert className="size-6 text-yellow-200" />
              <CardTitle>What it must never request</CardTitle>
              <CardDescription className="leading-7">
                Seed phrases, private keys, wallet passwords, or permission to move assets. Report any distribution package that requests them.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/contact?topic=extension-beta" className={buttonVariants()}>
            Request extension access
          </Link>
          <Link href="/docs" className={buttonVariants({ variant: "outline" })}>
            Read security documentation
          </Link>
        </div>
      </section>
    </main>
  )
}
