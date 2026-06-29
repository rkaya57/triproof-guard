import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const plans = {
  starter: { name: "Starter", amount: "99", wallets: "1,000" },
  growth: { name: "Growth", amount: "249", wallets: "10,000" },
  pro: { name: "Pro", amount: "499", wallets: "50,000" },
}

function planFromWallets(wallets: number) {
  if (wallets <= 1000) return "starter"
  if (wallets <= 10000) return "growth"
  return "pro"
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; requiredWallets?: string }>
}) {
  const params = await searchParams
  const requestedWallets = Number.parseInt(params.requiredWallets ?? "0", 10)
  const selectedPlan =
    params.plan && params.plan in plans
      ? params.plan
      : planFromWallets(Number.isFinite(requestedWallets) ? requestedWallets : 0)
  const plan = plans[selectedPlan as keyof typeof plans] ?? plans.starter

  return (
    <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>Checkout: {plan.name}</CardTitle>
            <CardDescription>
              Free trial is limited to 100 wallets. Continue with this plan to unlock larger analyses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/50 p-4">
                <p className="text-xs text-muted-foreground">Plan amount</p>
                <p className="mt-1 text-2xl font-semibold">{plan.amount} USDC</p>
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-4">
                <p className="text-xs text-muted-foreground">Wallet credits</p>
                <p className="mt-1 text-2xl font-semibold">{plan.wallets}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground">
              Payment address and automatic verification will be connected in the next step.
              For now this page confirms that paid users should continue through checkout instead of creating a large free analysis.
            </div>
            <div className="flex gap-3">
              <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>
                Back to Pricing
              </Link>
              <Link href="/dashboard/new-analysis" className={buttonVariants()}>
                Back to Analysis
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
