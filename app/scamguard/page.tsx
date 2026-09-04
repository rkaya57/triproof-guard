import { ChromeStoreReleaseBanner } from "@/components/scamguard/chrome-store-release-banner"
import { ScamGuardPage } from "@/components/scamguard/scamguard-page"
import { requirePageUser } from "@/lib/auth/page"
import { getDailyScanStatus } from "@/lib/billing/subscription"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "ScamGuard Multichain | Tri-Proof Protocol",
  description:
    "Scan suspicious Web3 links, wallets, token contracts, and transactions before users sign. ScamGuard Web3 Shield is available on the Chrome Web Store.",
}

export default async function Page() {
  const user = await requirePageUser("/scamguard")
  const access = await getDailyScanStatus(user)

  return (
    <>
      <ChromeStoreReleaseBanner />
      <style>{`
        .scamguard-store-migrated section#extension {
          display: none !important;
        }
        .scamguard-store-migrated a[href="#extension"],
        .scamguard-store-migrated a[href="/downloads/scamguard-chrome-extension.zip"] {
          display: none !important;
        }
      `}</style>
      <div className="scamguard-store-migrated">
        <ScamGuardPage
          access={{
            planName: access.plan.name,
            dailyScanLimit: access.dailyScanLimit,
            scanCount: access.scanCount,
            isAdmin: access.isAdmin,
          }}
        />
      </div>
    </>
  )
}
