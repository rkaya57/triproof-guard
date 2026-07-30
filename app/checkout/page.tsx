import { CheckoutForm } from "@/components/checkout/checkout-form"
import { requirePageUser } from "@/lib/auth/page"
import { billingPlans, getBillingPlan, planForWalletCount } from "@/lib/billing/plans"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; requiredWallets?: string }>
}) {
  const params = await searchParams
  const requestedWallets = Number.parseInt(params.requiredWallets ?? "0", 10)
  const selectedPlan = getBillingPlan(params.plan)?.id ?? planForWalletCount(
    Number.isFinite(requestedWallets) ? requestedWallets : 0
  )
  const plan = billingPlans[selectedPlan]
  await requirePageUser(`/checkout?plan=${encodeURIComponent(selectedPlan)}`)

  const networks = [
    {
      id: "solana" as const,
      label: "Solana Pay",
      treasuryAddress: process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS,
    },
  ]

  return (
    <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>Checkout: {plan.name}</CardTitle>
            <CardDescription>
              Free trial is limited to 100 wallets. Continue with a verified Solana USDC or SOL payment to unlock larger analyses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background/50 p-4">
                <p className="text-xs text-muted-foreground">Plan amount</p>
                <p className="mt-1 text-2xl font-semibold">{plan.amountUsdc} USDC or live SOL equivalent</p>
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-4">
                <p className="text-xs text-muted-foreground">Wallet credits</p>
                <p className="mt-1 text-2xl font-semibold">{plan.walletCredits.toLocaleString("en-US")}</p>
              </div>
            </div>
            <CheckoutForm
              plan={{
                id: plan.id,
                name: plan.name,
                amount: String(plan.amountUsdc),
                wallets: plan.walletCredits.toLocaleString("en-US"),
              }}
              networks={networks}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
