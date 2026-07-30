import { ScamGuardPage } from "@/components/scamguard/scamguard-page"
import { getDailyScanStatus } from "@/lib/billing/subscription"
import { requirePageUser } from "@/lib/auth/page"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "ScamGuard Multichain | Tri-Proof Guard",
  description:
    "Scan suspicious Web3 links, wallets, token contracts, and transactions before users sign.",
}

export default async function Page() {
  const user = await requirePageUser("/scamguard")
  const access = await getDailyScanStatus(user)

  return <ScamGuardPage access={{ planName: access.plan.name, dailyScanLimit: access.dailyScanLimit, scanCount: access.scanCount, isAdmin: access.isAdmin }} />
}
