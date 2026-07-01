import Image from "next/image"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const plans = [
  {
    name: "Starter",
    price: "29 USDC",
    detail: "Small campaign audits and first paid customer reports.",
    cta: "Pay with USDC",
    href: "/checkout?plan=starter",
    features: [
      "Up to 1,000 wallet credits",
      "Wallet risk score",
      "CSV export",
      "Clean reward list",
    ],
  },
  {
    name: "Growth",
    price: "99 USDC",
    detail: "Recommended for airdrops, testnets and active reward campaigns.",
    cta: "Pay with USDC",
    href: "/checkout?plan=growth",
    highlighted: true,
    features: [
      "Up to 10,000 wallet credits",
      "Cluster analysis",
      "Funding source analysis",
      "PDF report",
      "Gray-zone review list",
    ],
  },
  {
    name: "Pro",
    price: "249 USDC",
    detail: "High-volume audits, repeat operations and partner support.",
    cta: "Pay with USDC",
    href: "/checkout?plan=pro",
    features: [
      "Up to 50,000 wallet credits",
      "Priority analysis",
      "Advanced report",
      "API beta access",
      "Custom support",
    ],
  },
]

export function PricingPage() {
  return (
    <main className="premium-page min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Tri-Proof Guard"
            width={36}
            height={36}
            priority
            className="rounded-lg"
          />
          <span className="text-sm font-semibold">Tri-Proof Guard</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/demo" className={buttonVariants({ variant: "outline" })}>
            View Demo
          </Link>
          <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary`}>
            Free 100-wallet Trial
          </Link>
        </div>
      </header>

      <section className="security-grid border-y border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">
            Live Solana USDC checkout
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold sm:text-6xl">
            Pricing built for Web3 campaign scale.
          </h1>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Every account can test up to 100 wallets for free. Larger analyses continue through Solana USDC payment verification.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={
              plan.highlighted
                ? "glass-panel premium-card relative border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.14)]"
                : "glass-panel premium-card"
            }
          >
            {plan.highlighted && (
              <Badge className="absolute right-5 top-5 gap-1 bg-primary text-primary-foreground">
                <Sparkles className="size-3.5" />
                Most Popular
              </Badge>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.detail}</CardDescription>
              <div className="pt-3 text-3xl font-semibold">{plan.price}</div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <ul className="flex flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={buttonVariants({ variant: plan.highlighted ? "default" : "outline" })}
              >
                {plan.cta}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}
